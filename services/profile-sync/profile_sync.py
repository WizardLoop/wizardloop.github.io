"""Bot-only, bounded profile synchronization. No personal sessions or browser scraping."""
from __future__ import annotations

import argparse
import asyncio
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
import json
import logging
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import warnings

from PIL import Image, ImageDraw, ImageOps

MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_VIDEO_BYTES = 64 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "public/media/profile"
PUBLIC_PREFIX = "/media/profile/"
DEFAULT_BIO = "I'm an independent creator working across design, motion, animation, software and Telegram bots."
PUBLIC_FILES = ("avatar.jpg", "poster.jpg", "profile.mp4", "profile.json")
Image.MAX_IMAGE_PIXELS = 16_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)


class Unavailable(Exception):
    """Transient or unproven source. Never print the underlying API exception."""


class NoPublicProfile(Unavailable):
    """Explicit missing/personal primary: do not keep displaying a stale private image."""


class ConfigurationError(Exception):
    """A non-secret configuration problem."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def clean_bio(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    value = value.replace(chr(0x2014), "-")
    value = "".join(c for c in value if c in "\t\n" or ord(c) >= 32)
    return " ".join(value.split())[:500]


def field(obj: Any, name: str, default: Any = None) -> Any:
    return obj.get(name, default) if isinstance(obj, dict) else getattr(obj, name, default)


def choose_primary(user: Any, full: Any, history: list[Any]) -> Any:
    """The current ID is authoritative; dates and history order are irrelevant."""
    user_photo = field(user, "photo")
    active_id = field(user_photo, "photo_id")
    if not active_id or field(user_photo, "personal", False):
        raise NoPublicProfile("no_public_primary")
    personal = field(full, "personal_photo")
    if field(personal, "id") == active_id:
        raise NoPublicProfile("personal_photo_rejected")
    primary = field(full, "profile_photo")
    fallback = field(full, "fallback_photo")
    if field(fallback, "id") == active_id and field(primary, "id") != active_id:
        raise NoPublicProfile("fallback_is_not_primary")
    if field(primary, "id") == active_id:
        return primary
    for photo in history:
        if field(photo, "id") == active_id:
            return photo
    raise Unavailable("active_photo_not_resolved")


def choose_video(photo: Any) -> Any | None:
    """Only full animated-profile MPEG4 type u, never preview p or sticker markup."""
    variants = [v for v in field(photo, "video_sizes", []) or []
                if field(v, "type") == "u" and field(v, "w", 0) > 0
                and field(v, "h", 0) > 0 and field(v, "size", 0) > 0]
    return max(variants, key=lambda v: (field(v, "w") * field(v, "h"), field(v, "size")), default=None)


def choose_still(photo: Any) -> Any:
    variants = [s for s in field(photo, "sizes", []) or []
                if field(s, "w", 0) > 0 and field(s, "h", 0) > 0 and field(s, "type")]
    if not variants:
        raise Unavailable("profile_still_missing")
    return max(variants, key=lambda s: (field(s, "w") * field(s, "h"), field(s, "size", 0)))


def normalize_image(data: bytes) -> tuple[bytes, int, int]:
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise Unavailable("image_size_rejected")
    try:
        with Image.open(BytesIO(data)) as original:
            original.load()
            image = ImageOps.exif_transpose(original)
            if image.width < 32 or image.height < 32:
                raise Unavailable("image_dimensions_rejected")
            if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                rgba = image.convert("RGBA")
                image = Image.new("RGB", image.size, "#171a18")
                image.paste(rgba, mask=rgba.getchannel("A"))
            else:
                image = image.convert("RGB")
            target = BytesIO()
            image.save(target, "JPEG", quality=95, optimize=True, progressive=True)
            return target.getvalue(), image.width, image.height
    except Unavailable:
        raise
    except Exception:
        raise Unavailable("invalid_image") from None


def local_mark() -> bytes:
    image = Image.new("RGB", (640, 640), "#171a18")
    draw = ImageDraw.Draw(image)
    draw.ellipse((92, 92, 548, 548), outline="#cef948", width=12)
    draw.line([(177, 240), (242, 405), (320, 275), (398, 405), (463, 240)], fill="#cef948", width=27, joint="curve")
    output = BytesIO()
    image.save(output, "JPEG", quality=95)
    return output.getvalue()


def validate_video(data: bytes) -> None:
    if len(data) < 32 or len(data) > MAX_VIDEO_BYTES or data[4:8] != b"ftyp":
        raise Unavailable("invalid_mp4")
    offset, boxes = 0, set()
    while offset + 8 <= len(data):
        size, box = int.from_bytes(data[offset:offset + 4], "big"), data[offset + 4:offset + 8]
        header = 8
        if size == 1:
            if offset + 16 > len(data):
                raise Unavailable("invalid_mp4")
            size, header = int.from_bytes(data[offset + 8:offset + 16], "big"), 16
        if size == 0:
            size = len(data) - offset
        if size < header or offset + size > len(data):
            raise Unavailable("invalid_mp4")
        boxes.add(box)
        offset += size
    if offset != len(data) or not {b"ftyp", b"moov", b"mdat"}.issubset(boxes):
        raise Unavailable("invalid_mp4")


@dataclass
class Candidate:
    source: str
    avatar: bytes
    bio: str = ""
    video: bytes | None = None
    video_start: float = 0
    media_note: str = ""
    fixture: bool = False


@dataclass
class Settings:
    output: Path
    local_avatar: Path | None = None
    local_bio: str = DEFAULT_BIO
    cache_hours: float = 6
    ffmpeg: str | None = None
    force: bool = False


async def bounded_retry(operation, attempts: int = 3, timeout: float = 25):
    for attempt in range(attempts):
        try:
            return await asyncio.wait_for(operation(), timeout)
        except NoPublicProfile:
            raise
        except Exception as error:
            seconds = getattr(error, "seconds", None)
            if seconds is not None and (not isinstance(seconds, (int, float)) or seconds > 30):
                raise Unavailable("source_backoff_required") from None
            if attempt == attempts - 1:
                raise Unavailable("source_unavailable") from None
            await asyncio.sleep(max(0, seconds) if seconds is not None else 0.4 * 2 ** attempt)


class TelegramProvider:
    """Uses only a fresh bot MemorySession. No phone prompts or session files exist."""
    def __init__(self, environment: dict[str, str] | None = None):
        env = environment if environment is not None else os.environ
        if any(env.get(name) for name in ("TELEGRAM_SESSION", "TELEGRAM_STRING_SESSION", "TELEGRAM_PHONE")):
            raise ConfigurationError("personal_sessions_are_not_supported")
        self.api_id = env.get("TELEGRAM_API_ID", "")
        self.api_hash = env.get("TELEGRAM_API_HASH", "")
        self.bot_token = env.get("TELEGRAM_BOT_TOKEN", "")
        self.username = "wizardloop"

    async def fetch(self) -> Candidate:
        if not (self.api_id.isdecimal() and self.api_hash and self.bot_token):
            raise Unavailable("telegram_not_configured")
        try:
            from telethon import TelegramClient, functions, types, utils
            from telethon.sessions import MemorySession
        except ImportError:
            raise Unavailable("telegram_dependency_unavailable") from None
        logging.getLogger("telethon").setLevel(logging.CRITICAL)
        client = TelegramClient(MemorySession(), int(self.api_id), self.api_hash,
                                receive_updates=False, request_retries=0, connection_retries=1,
                                flood_sleep_threshold=0, timeout=10)

        async def resolve():
            resolved = await client(functions.contacts.ResolveUsernameRequest(username=self.username))
            identifier = getattr(resolved.peer, "user_id", None)
            user = next((u for u in resolved.users if u.id == identifier), None)
            if user is None:
                raise NoPublicProfile("public_user_missing")
            input_user = utils.get_input_user(user)
            details = await client(functions.users.GetFullUserRequest(id=input_user))
            user = next((u for u in details.users if u.id == user.id), user)
            full = details.full_user
            try:
                return user, full, choose_primary(user, full, [])
            except NoPublicProfile:
                raise
            except Unavailable:
                history = []
                for offset in range(0, 500, 100):
                    page = await client(functions.photos.GetUserPhotosRequest(user_id=input_user, offset=offset, max_id=0, limit=100))
                    history.extend(page.photos)
                    try:
                        return user, full, choose_primary(user, full, history)
                    except NoPublicProfile:
                        raise
                    except Unavailable:
                        if len(page.photos) < 100:
                            break
                raise Unavailable("active_photo_not_resolved")

        async def download(photo, variant, maximum):
            cached = getattr(variant, "bytes", None)
            if isinstance(cached, bytes):
                if len(cached) > maximum:
                    raise Unavailable("download_limit")
                return cached
            location = types.InputPhotoFileLocation(id=photo.id, access_hash=photo.access_hash,
                                                    file_reference=photo.file_reference, thumb_size=variant.type)
            size = getattr(variant, "size", None)
            if size is not None and size > maximum:
                raise Unavailable("download_limit")
            content = bytearray()
            stream = client.iter_download(location, dc_id=photo.dc_id, file_size=size)
            try:
                async for chunk in stream:
                    if len(content) + len(chunk) > maximum:
                        raise Unavailable("download_limit")
                    content.extend(chunk)
            finally:
                await stream.close()
            if size and len(content) != size:
                raise Unavailable("incomplete_download")
            return bytes(content)

        async def get_candidate():
            user, full, photo = await resolve()
            avatar = await download(photo, choose_still(photo), MAX_IMAGE_BYTES)
            selected = choose_video(photo)
            video, start, note = None, 0, ""
            if selected is not None:
                try:
                    video = await download(photo, selected, MAX_VIDEO_BYTES)
                    validate_video(video)
                    start = field(selected, "video_start_ts", 0) or 0
                    if not isinstance(start, (int, float)) or not math.isfinite(start) or not 0 <= start <= 3600:
                        start = 0
                except Exception as error:
                    if getattr(error, "seconds", None) is not None:
                        raise
                    # Retry the entire lookup once to refresh an expiring file reference.
                    refreshed_user, refreshed_full, refreshed = await resolve()
                    if refreshed.id != photo.id:
                        raise Unavailable("primary_changed_during_download")
                    retry_video = choose_video(refreshed)
                    if retry_video is not None:
                        try:
                            video = await download(refreshed, retry_video, MAX_VIDEO_BYTES)
                            validate_video(video)
                            start = field(retry_video, "video_start_ts", 0) or 0
                        except Exception as error:
                            if getattr(error, "seconds", None) is not None:
                                raise
                            video = None
                    note = "Animated profile unavailable; showing the current profile still." if video is None else ""
            elif field(field(user, "photo"), "has_video", False):
                note = "A full animated profile rendition was not accessible; showing the profile still."
            verify = await client(functions.users.GetFullUserRequest(id=utils.get_input_user(user)))
            fresh_user = next((u for u in verify.users if u.id == user.id), user)
            confirmed = choose_primary(fresh_user, verify.full_user, [photo])
            if field(confirmed, "id") != photo.id:
                raise Unavailable("primary_changed_during_download")
            return Candidate("telegram", avatar, clean_bio(field(full, "about")), video, start, note)

        try:
            await bounded_retry(client.connect)
            await bounded_retry(lambda: client.sign_in(bot_token=self.bot_token))
            me = await bounded_retry(client.get_me)
            if not me or not me.bot:
                raise NoPublicProfile("bot_authorization_required")
            return await bounded_retry(get_candidate, attempts=2, timeout=120)
        finally:
            try:
                await asyncio.wait_for(client.disconnect(), 10)
            except Exception:
                pass


class SafeRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def validate_public_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.username or parts.password or parts.port not in (None, 443) or parts.hostname not in {"api.github.com", "avatars.githubusercontent.com"}:
        raise Unavailable("untrusted_public_source")


def public_read(url: str, maximum: int) -> bytes:
    validate_public_url(url)
    request = Request(url, headers={"User-Agent": "WizardLoop-profile-sync", "Accept": "application/vnd.github+json" if urlsplit(url).hostname == "api.github.com" else "image/*"})
    with build_opener(SafeRedirects()).open(request, timeout=12) as response:
        length = response.headers.get("Content-Length")
        if length and int(length) > maximum:
            raise Unavailable("download_limit")
        result = response.read(maximum + 1)
        if len(result) > maximum:
            raise Unavailable("download_limit")
        return result


class GitHubProvider:
    async def metadata(self) -> dict:
        async def operation():
            raw = await asyncio.to_thread(public_read, "https://api.github.com/users/WizardLoop", 64 * 1024)
            data = json.loads(raw)
            if str(data.get("login", "")).lower() != "wizardloop":
                raise Unavailable("github_identity_mismatch")
            return data
        return await bounded_retry(operation, attempts=2, timeout=35)

    async def fetch_bio(self) -> str:
        return clean_bio((await self.metadata()).get("bio"))

    async def fetch(self) -> Candidate:
        data = await self.metadata()
        avatar_url = data.get("avatar_url", "")
        if urlsplit(avatar_url).hostname != "avatars.githubusercontent.com":
            raise Unavailable("github_avatar_host_rejected")
        avatar = await bounded_retry(lambda: asyncio.to_thread(public_read, avatar_url, MAX_IMAGE_BYTES), attempts=2, timeout=20)
        return Candidate("github", avatar, clean_bio(data.get("bio")))


class FixtureProvider:
    """Local synthetic providers only; cannot download URLs or authenticate."""
    def __init__(self, fixture: dict, source: str):
        self.fixture, self.source = fixture, source

    async def fetch(self) -> Candidate:
        config = self.fixture.get(self.source, {})
        if config.get("unavailable", True):
            raise Unavailable("fixture_unavailable")
        if self.source == "telegram":
            choose_primary(config["user"], config["full"], config.get("history", []))
        return Candidate(self.source, local_mark(), clean_bio(config.get("bio")), fixture=True,
                         media_note="Synthetic offline fixture. No live profile sync or video was performed.")

    async def fetch_bio(self) -> str:
        return (await self.fetch()).bio


def make_poster(video: bytes | None, avatar: bytes, timestamp: float, ffmpeg: str | None) -> tuple[bytes, str]:
    if video is None or not ffmpeg:
        return avatar, "profile-still"
    if not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or not 0 <= timestamp <= 3600:
        timestamp = 0
    with tempfile.TemporaryDirectory(prefix="wizardloop-poster-") as directory:
        source, target = Path(directory) / "profile.mp4", Path(directory) / "poster.jpg"
        source.write_bytes(video)
        try:
            clean_env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME") if key in os.environ}
            subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-ss", str(timestamp), "-i", str(source), "-map", "0:v:0", "-frames:v", "1", "-q:v", "2", "-y", str(target)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=25, env=clean_env)
            return normalize_image(target.read_bytes())[0], "video-frame"
        except (OSError, subprocess.SubprocessError, Unavailable):
            return avatar, "profile-still"


def read_previous(output: Path) -> dict | None:
    try:
        data = json.loads((output / "profile.json").read_text(encoding="utf-8"))
        if data.get("avatar") != PUBLIC_PREFIX + "avatar.jpg" or data.get("poster") != PUBLIC_PREFIX + "poster.jpg":
            return None
        normalize_image((output / "avatar.jpg").read_bytes())
        normalize_image((output / "poster.jpg").read_bytes())
        if data.get("video"):
            if data["video"] != PUBLIC_PREFIX + "profile.mp4":
                return None
            validate_video((output / "profile.mp4").read_bytes())
        # Never round-trip arbitrary fields into public metadata.
        keys = {"source", "avatar", "video", "poster", "bio", "bioSource", "syncedAt", "checkedAt", "status", "posterSource", "width", "height", "mediaNote"}
        result = {key: value for key, value in data.items() if key in keys}
        result["bio"] = clean_bio(result.get("bio"))
        return result
    except (OSError, ValueError, TypeError, Unavailable):
        return None


def atomic_file(target: Path, data: bytes) -> None:
    if target.is_file() and target.read_bytes() == data:
        return
    temporary = target.with_name(target.name + ".pending")
    try:
        with temporary.open("wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def commit(output: Path, assets: dict[str, bytes | None], manifest: dict) -> None:
    """Atomic per-file replacements, manifest last, rollback on ordinary write failure."""
    payloads = dict(assets)
    payloads["profile.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if any(name not in PUBLIC_FILES for name in payloads):
        raise ConfigurationError("unexpected_output_filename")
    backups = {name: (output / name).read_bytes() if (output / name).is_file() else None for name in payloads}
    written = []
    try:
        for name, content in payloads.items():
            if content is not None:
                atomic_file(output / name, content)
            else:
                (output / name).unlink(missing_ok=True)
            written.append(name)
    except OSError:
        for name in reversed(written):
            if backups[name] is None:
                (output / name).unlink(missing_ok=True)
            else:
                atomic_file(output / name, backups[name])
        raise Unavailable("output_commit_failed") from None


@contextmanager
def output_lock(output: Path):
    output.mkdir(parents=True, exist_ok=True)
    lock = output / ".sync.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise ConfigurationError("sync_already_locked") from None
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(now())
        yield
    finally:
        lock.unlink(missing_ok=True)


async def sync(settings: Settings, telegram, github) -> dict:
    with output_lock(settings.output):
        previous = read_previous(settings.output)
        checked_at = now()
        if previous and not settings.force:
            try:
                checked = datetime.fromisoformat(previous["checkedAt"].replace("Z", "+00:00"))
                elapsed = (datetime.now(timezone.utc) - checked).total_seconds()
                if 0 <= elapsed < settings.cache_hours * 3600:
                    return previous
            except (KeyError, TypeError, ValueError):
                pass
        candidate, retain_allowed = None, True
        try:
            candidate = await telegram.fetch()
            normalize_image(candidate.avatar)
        except NoPublicProfile:
            candidate, retain_allowed = None, False
        except Exception:
            candidate = None
        if candidate is None and previous and retain_allowed and previous.get("source", "").startswith("telegram"):
            retained = {**previous, "status": "retained", "checkedAt": checked_at}
            commit(settings.output, {}, retained)
            return retained
        secondary, secondary_bio = None, ""
        if candidate is None:
            try:
                secondary = await github.fetch()
                normalize_image(secondary.avatar)
            except Exception:
                secondary = None
            if secondary is None:
                # Biography availability is independent of the avatar download.
                try:
                    secondary_bio = clean_bio(await github.fetch_bio())
                except Exception:
                    secondary_bio = ""
        elif not clean_bio(candidate.bio):
            try:
                secondary_bio = clean_bio(await github.fetch_bio())
            except Exception:
                secondary_bio = ""
        candidate = candidate or secondary
        if candidate is None and previous and retain_allowed:
            retained = {**previous, "status": "retained", "checkedAt": checked_at}
            commit(settings.output, {}, retained)
            return retained
        if candidate is None:
            try:
                avatar = settings.local_avatar.read_bytes() if settings.local_avatar and settings.local_avatar.is_file() else local_mark()
                normalize_image(avatar)
            except (OSError, Unavailable):
                avatar = local_mark()
            candidate = Candidate("local", avatar)
        avatar, width, height = normalize_image(candidate.avatar)
        if candidate.video is not None:
            validate_video(candidate.video)
        bio, bio_source = clean_bio(candidate.bio), candidate.source
        if not bio and secondary_bio:
            bio, bio_source = secondary_bio, "github"
        if not bio:
            bio, bio_source = clean_bio(settings.local_bio), "local"
        poster, poster_source = make_poster(candidate.video, avatar, candidate.video_start, settings.ffmpeg)
        status = "fixture" if candidate.fixture else "current" if candidate.source == "telegram" else "fallback"
        note = candidate.media_note
        if candidate.video and poster_source != "video-frame":
            note = "Video available; poster uses the verified profile still because frame extraction was unavailable."
        manifest = {"source": candidate.source, "avatar": PUBLIC_PREFIX + "avatar.jpg", "video": PUBLIC_PREFIX + "profile.mp4" if candidate.video else None,
                    "poster": PUBLIC_PREFIX + "poster.jpg", "bio": bio, "bioSource": bio_source,
                    "syncedAt": checked_at, "checkedAt": checked_at, "status": status,
                    "posterSource": poster_source, "width": width, "height": height, "mediaNote": note}
        commit(settings.output, {"avatar.jpg": avatar, "poster.jpg": poster, "profile.mp4": candidate.video}, manifest)
        return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronize the public WizardLoop profile with bot-only MTProto.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--local-avatar", type=Path)
    parser.add_argument("--force", action="store_true", help="Bypass the six-hour public metadata cache")
    parser.add_argument("--fixture", type=Path, help="Offline synthetic fixture; requires a separate explicit output directory")
    args = parser.parse_args()
    try:
        settings = Settings(args.output.resolve(), args.local_avatar, clean_bio(os.environ.get("PROFILE_LOCAL_BIO", DEFAULT_BIO)),
                            ffmpeg=os.environ.get("FFMPEG_BINARY") or shutil.which("ffmpeg"), force=args.force or bool(args.fixture))
        if args.fixture:
            if args.output.resolve() == DEFAULT_OUTPUT.resolve():
                raise ConfigurationError("fixture_requires_separate_output")
            fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
            telegram, github = FixtureProvider(fixture, "telegram"), FixtureProvider(fixture, "github")
        else:
            telegram, github = TelegramProvider(), GitHubProvider()
        result = asyncio.run(sync(settings, telegram, github))
        print(json.dumps({"event": "profile_sync_complete", "source": result["source"], "status": result["status"], "video": bool(result.get("video")), "posterSource": result.get("posterSource")}))
        return 0
    except ConfigurationError as error:
        print(json.dumps({"event": "configuration_required", "reason": str(error)}))
        return 2
    except Exception:
        print(json.dumps({"event": "profile_sync_failed", "reason": "existing_assets_preserved_where_available"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
