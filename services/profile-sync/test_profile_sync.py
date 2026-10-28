"""Offline tests. These do not authenticate to Telegram or imply live video support."""
import asyncio
from contextlib import redirect_stdout
from io import BytesIO, StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import profile_sync as sync


class Provider:
    def __init__(self, candidate=None, error=None, bio=""):
        self.candidate, self.error, self.bio, self.calls = candidate, error, bio, 0

    async def fetch(self):
        self.calls += 1
        if self.error:
            raise self.error
        return self.candidate

    async def fetch_bio(self):
        if self.error:
            raise self.error
        return self.bio or self.candidate.bio


class SelectionTests(unittest.TestCase):
    def test_active_photo_is_not_the_newest_history_entry(self):
        active, newer = {"id": 7}, {"id": 99, "date": "later"}
        result = sync.choose_primary({"photo": {"photo_id": 7}}, {}, [newer, active])
        self.assertIs(result, active)

    def test_full_user_primary_must_match_current_user_photo(self):
        active = {"id": 7}
        self.assertIs(sync.choose_primary({"photo": {"photo_id": 7}}, {"profile_photo": active}, []), active)
        with self.assertRaises(sync.Unavailable):
            sync.choose_primary({"photo": {"photo_id": 7}}, {"profile_photo": {"id": 99}}, [{"id": 99}])

    def test_personal_and_fallback_photos_are_not_published(self):
        with self.assertRaises(sync.NoPublicProfile):
            sync.choose_primary({"photo": {"photo_id": 7, "personal": True}}, {}, [{"id": 7}])
        with self.assertRaises(sync.NoPublicProfile):
            sync.choose_primary({"photo": {"photo_id": 7}}, {"personal_photo": {"id": 7}}, [{"id": 7}])
        with self.assertRaises(sync.NoPublicProfile):
            sync.choose_primary({"photo": {"photo_id": 7}}, {"fallback_photo": {"id": 7}}, [{"id": 7}])

    def test_missing_active_id_never_selects_history(self):
        with self.assertRaises(sync.NoPublicProfile):
            sync.choose_primary({}, {}, [{"id": 99}])

    def test_best_full_video_beats_a_larger_preview_and_newer_photo(self):
        best = {"type": "u", "w": 1080, "h": 1080, "size": 2000, "video_start_ts": 1.75}
        photo = {"video_sizes": [{"type": "p", "w": 2000, "h": 2000, "size": 5000},
                                 {"type": "u", "w": 640, "h": 640, "size": 1000}, best]}
        self.assertIs(sync.choose_video(photo), best)
        self.assertEqual(sync.choose_video(photo)["video_start_ts"], 1.75)

    def test_no_full_video_does_not_promote_preview_to_full_animation(self):
        self.assertIsNone(sync.choose_video({"video_sizes": []}))
        self.assertIsNone(sync.choose_video({"video_sizes": [{"type": "p", "w": 100, "h": 100, "size": 1000}]}))

    def test_largest_still_selected(self):
        largest = {"type": "y", "w": 1080, "h": 1080}
        self.assertIs(sync.choose_still({"sizes": [{"type": "s", "w": 100, "h": 100}, largest]}), largest)

    def test_personal_sessions_are_rejected(self):
        with self.assertRaisesRegex(sync.ConfigurationError, "personal_sessions_are_not_supported"):
            sync.TelegramProvider({"TELEGRAM_SESSION": "secret-canary"})

    def test_only_expected_https_download_hosts_allowed(self):
        for url in ["http://api.github.com/users/WizardLoop", "https://127.0.0.1/private", "https://avatars.githubusercontent.com@evil.example/image", "file:///etc/passwd"]:
            with self.assertRaises(sync.Unavailable):
                sync.validate_public_url(url)
        sync.validate_public_url("https://avatars.githubusercontent.com/u/1?v=4")

    def test_bio_is_plain_limited_text_without_forbidden_dash(self):
        result = sync.clean_bio("Hello" + chr(0x2014) + "there\x00\n" + "x" * 600)
        self.assertNotIn(chr(0x2014), result)
        self.assertNotIn("\x00", result)
        self.assertLessEqual(len(result), 500)

    def test_image_and_video_reject_invalid_payloads(self):
        with self.assertRaises(sync.Unavailable):
            sync.normalize_image(b"<html>not an image</html>")
        with self.assertRaises(sync.Unavailable):
            sync.validate_video(b"<html>not a video</html>")

    def test_poster_falls_back_honestly_when_ffmpeg_is_missing(self):
        avatar = sync.local_mark()
        self.assertEqual(sync.make_poster(b"test", avatar, 1.75, None), (avatar, "profile-still"))

    def test_poster_uses_requested_frame_without_shell_or_credentials(self):
        avatar = sync.local_mark()
        calls = []
        def fake_ffmpeg(command, **kwargs):
            calls.append((command, kwargs))
            Path(command[-1]).write_bytes(avatar)
        with patch.object(sync.subprocess, "run", side_effect=fake_ffmpeg), patch.dict(sync.os.environ, {"TELEGRAM_BOT_TOKEN": "secret-canary"}):
            poster, source = sync.make_poster(b"test", avatar, 1.75, "ffmpeg")
        self.assertEqual(source, "video-frame")
        self.assertTrue(poster.startswith(b"\xff\xd8"))
        command, options = calls[0]
        self.assertEqual(command[command.index("-ss") + 1], "1.75")
        self.assertFalse(options.get("shell", False))
        self.assertNotIn("TELEGRAM_BOT_TOKEN", options["env"])


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="wizardloop-profile-test-")
        self.output = Path(self.directory.name)
        self.settings = sync.Settings(self.output, force=True)
        self.image = sync.local_mark()

    async def asyncTearDown(self):
        self.directory.cleanup()

    def unavailable(self):
        return Provider(error=sync.Unavailable("secret-canary-should-not-appear"))

    async def test_telegram_still_has_no_claimed_video(self):
        result = await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image, "Owner bio")), self.unavailable())
        self.assertEqual(result["source"], "telegram")
        self.assertIsNone(result["video"])
        self.assertEqual(result["posterSource"], "profile-still")
        self.assertFalse((self.output / "profile.mp4").exists())

    async def test_telegram_failure_preserves_latest_good_snapshot(self):
        original = await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image, "Owner bio")), self.unavailable())
        previous_image = (self.output / "avatar.jpg").read_bytes()
        github = Provider(sync.Candidate("github", self.image, "Different source"))
        result = await sync.sync(self.settings, self.unavailable(), github)
        self.assertEqual(result["status"], "retained")
        self.assertEqual(result["syncedAt"], original["syncedAt"])
        self.assertEqual(result["bio"], "Owner bio")
        self.assertEqual((self.output / "avatar.jpg").read_bytes(), previous_image)
        self.assertEqual(github.calls, 0)

    async def test_telegram_failure_without_previous_uses_github(self):
        result = await sync.sync(self.settings, self.unavailable(), Provider(sync.Candidate("github", self.image, "GitHub bio")))
        self.assertEqual(result["source"], "github")
        self.assertEqual(result["bioSource"], "github")
        self.assertEqual(result["status"], "fallback")

    async def test_both_sources_fail_uses_local_mark(self):
        result = await sync.sync(self.settings, self.unavailable(), self.unavailable())
        self.assertEqual(result["source"], "local")
        self.assertEqual(result["bio"], sync.DEFAULT_BIO)
        self.assertTrue((self.output / "poster.jpg").is_file())
        self.assertNotIn("secret-canary", (self.output / "profile.json").read_text())

    async def test_github_bio_survives_avatar_failure_without_telegram(self):
        github = Provider(error=sync.Unavailable("avatar_download_failed"))
        github.fetch_bio = AsyncMock(return_value="Available GitHub biography")
        result = await sync.sync(self.settings, self.unavailable(), github)
        self.assertEqual(result["source"], "local")
        self.assertEqual(result["bioSource"], "github")
        self.assertEqual(result["bio"], "Available GitHub biography")
        github.fetch_bio.assert_awaited_once()

    async def test_explicit_privacy_removal_does_not_retain_old_telegram_photo(self):
        await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image)), self.unavailable())
        result = await sync.sync(self.settings, Provider(error=sync.NoPublicProfile()), Provider(sync.Candidate("github", self.image, "Public fallback")))
        self.assertEqual(result["source"], "github")
        self.assertNotEqual(result["status"], "retained")

    async def test_github_fallback_can_refresh_on_later_runs(self):
        await sync.sync(self.settings, self.unavailable(), Provider(sync.Candidate("github", self.image, "Old bio")))
        result = await sync.sync(self.settings, self.unavailable(), Provider(sync.Candidate("github", self.image, "New bio")))
        self.assertEqual(result["bio"], "New bio")

    async def test_missing_telegram_bio_uses_github_bio_independently(self):
        result = await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image)), Provider(bio="GitHub public bio"))
        self.assertEqual(result["source"], "telegram")
        self.assertEqual(result["bioSource"], "github")
        self.assertEqual(result["bio"], "GitHub public bio")

    async def test_cache_avoids_repeated_network_calls(self):
        await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image)), self.unavailable())
        self.settings.force = False
        telegram = self.unavailable()
        await sync.sync(self.settings, telegram, self.unavailable())
        self.assertEqual(telegram.calls, 0)

    async def test_failed_commit_restores_previous_assets_and_manifest(self):
        await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image, "Before")), self.unavailable())
        before = {name: (self.output / name).read_bytes() for name in ("avatar.jpg", "poster.jpg", "profile.json")}
        original_replace, failed = sync.os.replace, False
        changed = BytesIO()
        sync.Image.new("RGB", (640, 640), "#665599").save(changed, "JPEG")

        def fail_once(source, target):
            nonlocal failed
            if Path(target).name == "poster.jpg" and not failed:
                failed = True
                raise OSError("simulated disk failure")
            return original_replace(source, target)

        with patch.object(sync.os, "replace", side_effect=fail_once):
            with self.assertRaises(sync.Unavailable):
                await sync.sync(self.settings, Provider(sync.Candidate("telegram", changed.getvalue(), "After")), self.unavailable())
        self.assertEqual({name: (self.output / name).read_bytes() for name in before}, before)
        self.assertFalse((self.output / ".sync.lock").exists())

    async def test_cached_unknown_fields_cannot_leak_to_public_manifest(self):
        await sync.sync(self.settings, Provider(sync.Candidate("telegram", self.image)), self.unavailable())
        path = self.output / "profile.json"
        data = json.loads(path.read_text())
        data["access_hash"] = "secret-canary"
        data["session"] = "session-canary"
        path.write_text(json.dumps(data))
        await sync.sync(self.settings, self.unavailable(), self.unavailable())
        self.assertNotIn("canary", path.read_text())

    async def test_fixture_is_explicitly_labelled(self):
        fixture = json.loads((Path(__file__).parent / "fixtures/active-still.json").read_text())
        result = await sync.sync(self.settings, sync.FixtureProvider(fixture, "telegram"), sync.FixtureProvider(fixture, "github"))
        self.assertEqual(result["status"], "fixture")
        self.assertIn("No live", result["mediaNote"])
        self.assertIsNone(result["video"])

    async def test_retry_recovers_from_a_transient_error(self):
        attempts = 0
        async def operation():
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise OSError("private-request-detail")
            return "ready"
        self.assertEqual(await sync.bounded_retry(operation, attempts=2), "ready")
        self.assertEqual(attempts, 2)

    async def test_long_flood_wait_stops_without_repeated_requests(self):
        attempts = 0
        class FloodWait(Exception):
            seconds = 120
        async def operation():
            nonlocal attempts
            attempts += 1
            raise FloodWait("private-request-detail")
        with self.assertRaisesRegex(sync.Unavailable, "source_backoff_required"):
            await sync.bounded_retry(operation)
        self.assertEqual(attempts, 1)

    async def test_request_timeout_becomes_a_non_secret_failure(self):
        async def operation():
            await asyncio.sleep(1)
        with self.assertRaisesRegex(sync.Unavailable, "source_unavailable"):
            await sync.bounded_retry(operation, attempts=1, timeout=0.001)


class CommandTests(unittest.TestCase):
    def test_fixture_rejects_repository_output_from_another_working_directory(self):
        previous_directory = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                sync.os.chdir(directory)
                arguments = ["profile_sync.py", "--fixture", "unused-fixture.json", "--output", str(sync.DEFAULT_OUTPUT)]
                with patch("sys.argv", arguments), patch.object(sync, "sync", new=AsyncMock()) as runner, redirect_stdout(StringIO()) as output:
                    self.assertEqual(sync.main(), 2)
                runner.assert_not_called()
                self.assertIn("fixture_requires_separate_output", output.getvalue())
            finally:
                sync.os.chdir(previous_directory)

    def test_failure_logs_do_not_include_exception_secrets(self):
        output = StringIO()
        with patch("sys.argv", ["profile_sync.py"]), patch.object(sync, "TelegramProvider", side_effect=RuntimeError("secret-canary")), redirect_stdout(output):
            self.assertEqual(sync.main(), 1)
        self.assertNotIn("secret-canary", output.getvalue())
        self.assertIn("profile_sync_failed", output.getvalue())

    def test_telethon_schema_constructor_signatures_without_authentication(self):
        try:
            from telethon import functions, types
        except ImportError:
            self.skipTest("Install pinned requirements to check Telethon schema signatures")
        location = types.InputPhotoFileLocation(id=7, access_hash=0, file_reference=b"", thumb_size="u")
        request = functions.photos.GetUserPhotosRequest(user_id=types.InputUser(user_id=7, access_hash=0), offset=0, max_id=0, limit=100)
        self.assertEqual(location.thumb_size, "u")
        self.assertEqual(request.limit, 100)


if __name__ == "__main__":
    unittest.main()
