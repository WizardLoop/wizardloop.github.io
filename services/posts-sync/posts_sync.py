"""WizardLoop channel index sync. MIT code; channel content retains its rights."""
from __future__ import annotations

import argparse
import contextlib
import copy
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
import urllib.error
import urllib.request

CHANNEL = "wizard_loop"
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "src/content/posts.json"
MAX_BYTES = 4 * 1024 * 1024
MAX_MESSAGES = 10000
ALLOWED_METHODS = {"getMe", "getWebhookInfo", "getChat", "getChatMember", "getUpdates"}


class SyncError(Exception):
    """Only fixed, nonpersonal error codes may cross the logging boundary."""


class ProtectedChannel(SyncError):
    """Authoritative privacy change, distinct from a temporary network failure."""
    def __init__(self, channel_id, bot_id):
        super().__init__("channel_content_protected")
        self.channel_id, self.bot_id = channel_id, bot_id


class Retryable(SyncError):
    def __init__(self, delay=1):
        super().__init__("temporary_api_failure")
        self.delay = delay


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def date_string(value):
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise SyncError("invalid_message_date")
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        raise SyncError("invalid_message_date") from None


def positive(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def clean_text(value, limit):
    if not isinstance(value, str):
        return ""
    return "".join(c for c in value.replace(chr(0x2014), "-") if c in "\n\t" or ord(c) >= 32)[:limit].strip()


def read_json(path, required=True):
    if not path.exists() and not required:
        return None
    try:
        if path.stat().st_size > MAX_BYTES:
            raise SyncError("local_data_too_large")
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise SyncError("invalid_local_data") from None


def atomic_json(path, value, private=False):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(data) > MAX_BYTES:
        raise SyncError("local_data_too_large")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, pending = tempfile.mkstemp(prefix=".posts-", suffix=".pending", dir=path.parent)
    try:
        if private:
            os.chmod(pending, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(pending, path)
    finally:
        if os.path.exists(pending):
            os.unlink(pending)


@contextlib.contextmanager
def lock(state_dir):
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = state_dir / ".lock"
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise SyncError("sync_already_running_or_stale_lock") from None
    try:
        os.close(fd)
        yield
    finally:
        path.unlink(missing_ok=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SyncError("api_redirect_rejected")


class BotAPI:
    def __init__(self, token, opener=None, sleep=time.sleep):
        if not re.fullmatch(r"[0-9]{5,20}:[A-Za-z0-9_-]{20,100}", token or ""):
            raise SyncError("missing_or_invalid_bot_token")
        self._token = token
        self._opener = opener or urllib.request.build_opener(NoRedirect())
        self._sleep = sleep

    def _once(self, method, params):
        if method not in ALLOWED_METHODS:
            raise SyncError("api_method_not_allowed")
        # The token must appear in Telegram's URL protocol. Never log the URL,
        # Request object, raw response, or exception text. Redirects are refused.
        request = urllib.request.Request(
            "https://api.telegram.org/bot" + self._token + "/" + method,
            data=json.dumps(params).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "WizardLoop-Posts-Sync/1.0"},
            method="POST",
        )
        status = 200
        try:
            with self._opener.open(request, timeout=35) as response:
                raw = response.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as error:
            status = error.code
            raw = error.read(MAX_BYTES + 1)
            error.close()
        except (urllib.error.URLError, TimeoutError, OSError):
            raise Retryable() from None
        if len(raw) > MAX_BYTES:
            raise SyncError("api_response_too_large")
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeError):
            if status >= 500:
                raise Retryable() from None
            raise SyncError("invalid_api_response") from None
        if not isinstance(body, dict):
            raise SyncError("invalid_api_response")
        code = body.get("error_code", status)
        if code == 429:
            delay = body.get("parameters", {}).get("retry_after", 2)
            if not isinstance(delay, (int, float)) or not 0 <= delay <= 30:
                raise SyncError("api_backoff_required")
            raise Retryable(delay)
        if status >= 500 or (isinstance(code, int) and code >= 500):
            raise Retryable()
        if status != 200 or body.get("ok") is not True:
            raise SyncError("api_access_or_request_rejected")
        return body.get("result")

    def call(self, method, **params):
        for attempt in range(3):
            try:
                return self._once(method, params)
            except Retryable as error:
                if attempt == 2:
                    raise SyncError("api_unavailable_after_retries") from None
                self._sleep(max(error.delay, 2 ** attempt))


def verify_channel(api):
    info = api.call("getWebhookInfo")
    if not isinstance(info, dict) or info.get("url"):
        raise SyncError("existing_webhook_or_invalid_status")
    bot = api.call("getMe")
    chat = api.call("getChat", chat_id="@" + CHANNEL)
    if not isinstance(bot, dict) or not bot.get("is_bot") or not positive(bot.get("id")):
        raise SyncError("invalid_bot_identity")
    if (not isinstance(chat, dict) or chat.get("type") != "channel"
            or str(chat.get("username", "")).lower() != CHANNEL
            or not isinstance(chat.get("id"), int) or chat["id"] >= 0):
        raise SyncError("channel_identity_mismatch")
    member = api.call("getChatMember", chat_id=chat["id"], user_id=bot["id"])
    if not isinstance(member, dict) or member.get("status") not in ("administrator", "creator"):
        raise SyncError("channel_bot_admin_required")
    if chat.get("has_protected_content") is True:
        raise ProtectedChannel(chat["id"], bot["id"])
    return chat["id"], bot["id"]


def media_types(message):
    kinds = []
    if message.get("photo"):
        kinds.append("Photo")
    for key, label in (("video", "Video"), ("animation", "Animation"), ("audio", "Audio"),
                       ("voice", "Voice"), ("video_note", "Video message"), ("poll", "Poll"),
                       ("paid_media", "Paid media"), ("rich_message", "Rich message")):
        if message.get(key):
            kinds.append(label)
    sticker = message.get("sticker")
    if isinstance(sticker, dict):
        kinds.append("TGS sticker" if sticker.get("is_animated") else "WebM sticker" if sticker.get("is_video") else "Sticker")
    if message.get("document") and not message.get("animation"):
        kinds.append("Document")
    entities = message.get("entities", []) + message.get("caption_entities", [])
    if any(isinstance(item, dict) and item.get("type") == "custom_emoji" for item in entities):
        kinds.append("Custom emoji")
    return sorted(set(kinds))


def normalize_message(message):
    if not positive(message.get("message_id")):
        raise SyncError("invalid_message_id")
    text = clean_text(message.get("text") or message.get("caption"), 4096)
    kinds = media_types(message)
    if not text and not kinds:
        return None  # Channel service events are not portfolio posts.
    group = message.get("media_group_id")
    if group is not None and (not isinstance(group, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", group)):
        raise SyncError("invalid_media_group")
    return {"id": message["message_id"], "text": text, "media": kinds, "group": group,
            "date": date_string(message.get("date")),
            "editedAt": date_string(message["edit_date"]) if message.get("edit_date") else None}


def initial_state(channel_id, bot_id):
    return {"version": 1, "channelId": channel_id, "botId": bot_id, "nextOffset": None,
            "messages": {}, "blockedIds": [], "lastSyncedAt": None}


def validate_state(state, channel_id, bot_id):
    if (not isinstance(state, dict) or state.get("version") != 1
            or state.get("channelId") != channel_id or state.get("botId") != bot_id
            or not isinstance(state.get("messages"), dict)
            or not isinstance(state.get("blockedIds"), list)
            or len(state["messages"]) > MAX_MESSAGES
            or (state.get("nextOffset") is not None and not positive(state["nextOffset"]))):
        raise SyncError("private_state_identity_or_schema_mismatch")


def apply_updates(state, updates, channel_id):
    if not isinstance(updates, list) or len(updates) > 100:
        raise SyncError("invalid_updates_batch")
    updated = copy.deepcopy(state)
    ids = [item.get("update_id") if isinstance(item, dict) else None for item in updates]
    if any(not positive(item) for item in ids) or len(ids) != len(set(ids)):
        raise SyncError("invalid_update_id")
    for update in sorted(updates, key=lambda item: item["update_id"]):
        if state["nextOffset"] is not None and update["update_id"] < state["nextOffset"]:
            continue
        message = update.get("channel_post") or update.get("edited_channel_post")
        # Ignore other chats and unwanted update types that predate allowed_updates.
        if isinstance(message, dict):
            chat = message.get("chat", {})
            if chat.get("id") == channel_id and chat.get("type") == "channel":
                if not positive(message.get("message_id")):
                    raise SyncError("invalid_message_id")
                key = str(message["message_id"])
                if message.get("has_protected_content") or chat.get("has_protected_content"):
                    updated["messages"].pop(key, None)
                    updated["blockedIds"] = sorted(set(updated["blockedIds"] + [message["message_id"]]))
                else:
                    normalized = normalize_message(message)
                    if normalized:
                        updated["messages"][key] = normalized
                        updated["blockedIds"] = [item for item in updated["blockedIds"] if item != message["message_id"]]
        updated["nextOffset"] = update["update_id"] + 1
    if len(updated["messages"]) > MAX_MESSAGES:
        raise SyncError("message_capacity_reached")
    return updated


def validate_seed(seed):
    if (not isinstance(seed, dict) or seed.get("channel") != CHANNEL
            or not isinstance(seed.get("posts"), list) or len(seed["posts"]) > MAX_MESSAGES):
        raise SyncError("invalid_seed")
    seen = set()
    for item in seed["posts"]:
        if not isinstance(item, dict) or not positive(item.get("id")) or item["id"] in seen:
            raise SyncError("invalid_seed_post")
        seen.add(item["id"])
        for field in ("title", "kind", "note"):
            if not isinstance(item.get(field), str):
                raise SyncError("invalid_seed_post")
        if not re.fullmatch(r"https://t\.me/wizard_loop/" + str(item["id"]), str(item.get("url", "")), re.I):
            raise SyncError("invalid_seed_url")
        if any(not positive(member) for member in item.get("messageIds", [item["id"]])):
            raise SyncError("invalid_seed_album")


def render_index(seed, state, excluded=(), fixture=False, timestamp=None):
    validate_seed(seed)
    blocked = set(state["blockedIds"]) | set(excluded)
    groups = {}
    for message in state["messages"].values():
        if message["id"] not in blocked:
            groups.setdefault(message["group"] or "single:" + str(message["id"]), []).append(message)
    generated, handled = [], set()
    for messages in groups.values():
        messages.sort(key=lambda item: item["id"])
        members = [item["id"] for item in messages]
        handled.update(members)
        text = next((item["text"] for item in messages if item["text"]), "")
        media = sorted({kind for item in messages for kind in item["media"]})
        kind = "Album" if len(messages) > 1 else ", ".join(media) or "Text"
        first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
        title = first_line[:96] or "Telegram " + kind.lower()
        note = "Open the original post for its complete formatting and media."
        if set(media) & {"TGS sticker", "WebM sticker", "Custom emoji", "Rich message", "Paid media"}:
            note += " Some content may require the Telegram app; an embed is not a guarantee of full playback."
        if len(messages) > 1:
            note += " Album members are linked individually; Telegram controls the embedded album presentation."
        generated.append({"id": members[0], "title": title, "kind": kind,
                          "url": f"https://t.me/{CHANNEL}/{members[0]}", "note": note,
                          "origin": "fixture" if fixture else "telegram-updates", "date": messages[0]["date"],
                          "editedAt": max((item["editedAt"] for item in messages if item["editedAt"]), default=None),
                          "messageIds": members, "media": media, "excerpt": clean_text(text, 280)})
    # Seed entries are a deliberately incomplete, verified manual history. They
    # survive every poll until a matching message is updated or owner-excluded.
    retained = []
    for item in seed["posts"]:
        members = set(item.get("messageIds", [item["id"]]))
        if members & (handled | blocked):
            continue
        kept = {key: clean_text(item[key], 800) for key in ("title", "kind", "note")}
        kept.update({"id": item["id"], "url": f"https://t.me/{CHANNEL}/{item['id']}",
                     "origin": item.get("origin", "manual-verified")})
        for key in ("date", "editedAt", "messageIds", "media", "excerpt"):
            if key in item:
                kept[key] = item[key]
        retained.append(kept)
    return {"channel": CHANNEL, "source": f"https://t.me/s/{CHANNEL}",
            "status": "fixture" if fixture else "incremental",
            "verifiedAt": seed.get("verifiedAt"), "lastSyncedAt": timestamp or now(),
            "historyComplete": False,
            "posts": sorted(retained + generated, key=lambda item: item["id"], reverse=True)}


def persist_batch(output, state_path, index, state):
    # Public index first, then private cursor. If the second write fails, Telegram
    # replays unacknowledged updates. The deterministic merge is idempotent.
    atomic_json(output, index)
    atomic_json(state_path, state, private=True)


def run_sync(api, seed, output, state_dir, excluded=(), max_batches=20, fixture_batches=None):
    fixture = fixture_batches is not None
    protected = False
    try:
        channel_id, bot_id = (-1000000000001, 100000) if fixture else verify_channel(api)
    except ProtectedChannel as notice:
        channel_id, bot_id = notice.channel_id, notice.bot_id
        protected = True
    state_path = state_dir / "state.json"
    retained_path = state_dir / "last-public-index.json"
    state = read_json(state_path, required=False) or initial_state(channel_id, bot_id)
    validate_state(state, channel_id, bot_id)
    validate_seed(seed)
    if protected:
        # Keep recovery material private, and do not acknowledge or read updates.
        # Repeated protected checks must not replace the saved index with an empty one.
        if seed.get("status") != "protected":
            atomic_json(retained_path, seed, private=True)
        if not state_path.exists():
            atomic_json(state_path, state, private=True)
        index = {"channel": CHANNEL, "source": f"https://t.me/s/{CHANNEL}",
                 "status": "protected", "verifiedAt": seed.get("verifiedAt"),
                 "lastSyncedAt": state.get("lastSyncedAt"), "checkedAt": now(),
                 "historyComplete": False, "posts": []}
        atomic_json(output, index)
        return {"event": "posts_sync_complete", "status": "protected",
                "updatesProcessed": 0, "posts": 0, "historyComplete": False}
    if seed.get("status") == "protected":
        retained = read_json(retained_path, required=False)
        if retained is not None:
            validate_seed(retained)
            seed = retained
    last_index = seed
    count = 0
    for number in range(max_batches):
        if fixture:
            if number >= len(fixture_batches):
                break
            updates = fixture_batches[number]
        else:
            params = {"limit": 100, "timeout": 20, "allowed_updates": ["channel_post", "edited_channel_post"]}
            if state["nextOffset"] is not None:
                params["offset"] = state["nextOffset"]
            updates = api.call("getUpdates", **params)
        proposed = apply_updates(state, updates, channel_id)
        proposed["lastSyncedAt"] = now()
        index = render_index(last_index, proposed, excluded, fixture, proposed["lastSyncedAt"])
        persist_batch(output, state_path, index, proposed)
        state, last_index = proposed, index
        count += len(updates)
        if not fixture and len(updates) < 100:
            break
    return {"event": "posts_sync_complete", "status": "fixture" if fixture else "incremental",
            "updatesProcessed": count, "posts": len(last_index["posts"]), "historyComplete": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Index WizardLoop posts with supported Bot API updates.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--live", action="store_true", help="Use configured Bot API credentials.")
    mode.add_argument("--fixture", type=Path, help="Offline fixture; requires a separate output file.")
    parser.add_argument("--seed", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--state-dir", type=Path, default=os.environ.get("POSTS_SYNC_STATE_DIR"))
    parser.add_argument("--exclude-ids", type=Path, help="Owner-maintained JSON array of removed message IDs.")
    args = parser.parse_args(argv)
    try:
        if not args.state_dir:
            raise SyncError("private_state_directory_required")
        state_dir = Path(args.state_dir).resolve()
        if args.live and (state_dir == ROOT or ROOT in state_dir.parents):
            raise SyncError("live_state_must_be_outside_repository")
        if args.fixture and args.output.resolve() == DEFAULT_OUTPUT.resolve():
            raise SyncError("fixture_requires_separate_output")
        seed = read_json(args.seed)
        validate_seed(seed)
        excluded = read_json(args.exclude_ids) if args.exclude_ids else []
        if not isinstance(excluded, list) or any(not positive(item) for item in excluded):
            raise SyncError("invalid_excluded_ids")
        batches = read_json(args.fixture) if args.fixture else None
        if batches is not None and (not isinstance(batches, list) or not batches):
            raise SyncError("invalid_fixture")
        api = None if args.fixture else BotAPI(os.environ.get("POSTS_TELEGRAM_BOT_TOKEN"))
        with lock(state_dir):
            result = run_sync(api, seed, args.output.resolve(), state_dir, excluded, fixture_batches=batches)
        print(json.dumps(result))
        return 0
    except SyncError as error:
        print(json.dumps({"event": "posts_sync_failed", "reason": str(error), "lastGoodPreserved": True}))
        return 1
    except Exception:
        # Intentionally omit exception text/traceback: HTTP exceptions can carry credentials.
        print(json.dumps({"event": "posts_sync_failed", "reason": "local_or_unexpected_failure"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
