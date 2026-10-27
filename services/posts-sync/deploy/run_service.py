"""Inactive Linux host adapter. No deployment, GitHub write, or embedded secrets."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

REPOSITORY = Path("/opt/wizardloop/repository")
DATA = Path("/var/lib/wizardloop-content")
BUILDS = Path("/var/lib/wizardloop-build")
PYTHON = "/opt/wizardloop/profile-venv/bin/python"
PROFILE_FILES = {"avatar.jpg", "poster.jpg", "profile.mp4", "profile.json"}


def safe_env():
    # Build/package tools never inherit bot tokens or the credential mount path.
    return {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
            "HOME": str(BUILDS), "CI": "true", "ASTRO_TELEMETRY_DISABLED": "1",
            "PYTHONDONTWRITEBYTECODE": "1"}


def secret_env(names):
    directory = Path(os.environ["CREDENTIALS_DIRECTORY"])
    result = safe_env()
    for filename, variable in names.items():
        path = directory / filename
        if path.stat().st_size > 4096:
            raise ValueError("invalid_credential")
        value = path.read_text(encoding="utf-8").strip()
        if not value or "\n" in value or "\r" in value:
            raise ValueError("invalid_credential")
        result[variable] = value
    return result


@contextmanager
def snapshot_lock(shared=False):
    # Precreated by the operator, group-readable. flock works with this read FD;
    # the kernel releases it on exit. Both sync writers use an exclusive lock.
    import fcntl
    with (DATA / "snapshot.lock").open("rb") as stream:
        fcntl.flock(stream.fileno(), fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        yield
        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def command(args, *, env=None, cwd=REPOSITORY, timeout=1800, capture=False):
    return subprocess.run(args, cwd=cwd, env=env or safe_env(), check=True, timeout=timeout,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None, text=capture)


def readable_public(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("invalid_public_snapshot")
    path.chmod(0o640)


def sync_posts():
    output = DATA / "public/posts.json"
    seed = output if output.exists() else REPOSITORY / "src/content/posts.json"
    env = secret_env({"posts-token": "POSTS_TELEGRAM_BOT_TOKEN"})
    with snapshot_lock():
        command(["/usr/bin/python3", str(REPOSITORY / "services/posts-sync/posts_sync.py"),
                 "--live", "--seed", str(seed), "--output", str(output),
                 "--state-dir", str(DATA / "private/posts"),
                 "--exclude-ids", "/etc/wizardloop/removed-posts.json"], env=env, timeout=1200)
        readable_public(output)


def sync_profile():
    output = DATA / "public/profile"
    env = secret_env({"profile-api-id": "TELEGRAM_API_ID", "profile-api-hash": "TELEGRAM_API_HASH",
                      "profile-token": "TELEGRAM_BOT_TOKEN"})
    with snapshot_lock():
        command([PYTHON, str(REPOSITORY / "services/profile-sync/profile_sync.py"),
                 "--force", "--output", str(output)], env=env, timeout=600)
        for name in PROFILE_FILES:
            if (output / name).exists():
                readable_public(output / name)


def read_manifest(path):
    if path.is_symlink() or path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("invalid_public_manifest")
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict) or result.get("status") == "fixture":
        raise ValueError("fixture_or_invalid_manifest")
    return result


def copy_public_snapshot(source, destination):
    """Only explicit public files cross from the sync account to the builder."""
    posts = read_manifest(source / "posts.json")
    profile = read_manifest(source / "profile/profile.json")
    if posts.get("channel") != "wizard_loop" or posts.get("status") not in {"incremental", "protected"}:
        raise ValueError("unverified_posts_source")
    if posts.get("status") == "protected" and posts.get("posts") != []:
        raise ValueError("protected_index_must_be_empty")
    if profile.get("source") not in {"telegram", "github", "local"}:
        raise ValueError("unverified_profile_source")
    expected = {"avatar": "/media/profile/avatar.jpg", "poster": "/media/profile/poster.jpg"}
    if any(profile.get(key) != value for key, value in expected.items()):
        raise ValueError("unexpected_profile_path")
    if profile.get("video") not in (None, "/media/profile/profile.mp4"):
        raise ValueError("unexpected_video_path")
    media = destination / "public/media/profile"
    media.mkdir(parents=True, exist_ok=True)
    for name in PROFILE_FILES:
        target = media / name
        if target.exists() or target.is_symlink():
            if target.is_dir():
                raise ValueError("unexpected_profile_directory")
            target.unlink()
    names = {"profile.json", "avatar.jpg", "poster.jpg"}
    if profile.get("video"):
        names.add("profile.mp4")
    for name in names:
        path = source / "profile" / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 64 * 1024 * 1024:
            raise ValueError("invalid_profile_asset")
        shutil.copyfile(path, media / name)
    (destination / "src/content").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / "posts.json", destination / "src/content/posts.json")
    return {"postsSyncedAt": posts.get("lastSyncedAt"), "postsStatus": posts.get("status"),
            "postsCheckedAt": posts.get("checkedAt"), "profileSyncedAt": profile.get("syncedAt"),
            "profileStatus": profile.get("status"), "profileSource": profile.get("source")}


def unpack_source(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            target = destination / item.filename
            if (item.filename.startswith(("/", "\\")) or "\\" in item.filename
                    or not target.resolve().is_relative_to(destination.resolve())
                    or stat.S_ISLNK(item.external_attr >> 16)):
                raise ValueError("unsafe_source_archive")
        bundle.extractall(destination)


def bundle_static(dist, output):
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(dist.rglob("*")):
            if path.is_symlink():
                raise ValueError("symlink_in_static_build")
            if path.is_file():
                archive.write(path, path.relative_to(dist))


def prepare_build():
    # The repository and this adapter are root-owned and pinned by the operator.
    # This process has no bot credentials, no GitHub token, and no write access
    # to the source checkout or private cursor directory.
    git = ["/usr/bin/git", "-c", "safe.directory=" + str(REPOSITORY)]
    commit = command(git + ["rev-parse", "HEAD"], capture=True).stdout.strip()
    if not re.fullmatch(r"[a-f0-9]{40,64}", commit):
        raise ValueError("invalid_source_commit")
    BUILDS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="prepare-", dir=BUILDS) as temporary:
        temporary = Path(temporary)
        archive = temporary / "source.zip"
        work = temporary / "site"
        work.mkdir()
        command(git + ["archive", "--format=zip", "--output=" + str(archive), commit])
        unpack_source(archive, work)
        with snapshot_lock(shared=True):
            provenance = copy_public_snapshot(DATA / "public", work)
        # No credentials are passed into dependency installation or build hooks.
        command(["/usr/bin/npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], cwd=work)
        command(["/usr/bin/npm", "run", "check"], cwd=work)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        output = BUILDS / "artifacts" / (stamp + "-" + commit[:12])
        output.mkdir(parents=True, exist_ok=False)
        pending = output / "static.zip.pending"
        try:
            bundle_static(work / "dist", pending)
            digest = hashlib.sha256(pending.read_bytes()).hexdigest()
            (output / "provenance.json").write_text(json.dumps({"sourceCommit": commit,
                "preparedAt": stamp, "sha256": digest, "published": False,
                "checks": "npm run check", **provenance}, indent=2) + "\n", encoding="utf-8")
            pending.rename(output / "static.zip")
        except Exception:
            pending.unlink(missing_ok=True)
            raise
    print(json.dumps({"event": "static_artifact_prepared", "published": False, "sourceCommit": commit}))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Operator-installed persistent sync adapter. No publishing.")
    parser.add_argument("mode", choices=("posts", "profile", "build"))
    args = parser.parse_args(argv)
    try:
        {"posts": sync_posts, "profile": sync_profile, "build": prepare_build}[args.mode]()
        return 0
    except Exception:
        # Never print subprocess exceptions: callers can contain credentialed state.
        print(json.dumps({"event": "scheduled_content_job_failed", "mode": args.mode}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
