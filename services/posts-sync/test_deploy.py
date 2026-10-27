"""Offline deployment-adapter tests; no systemd activation or network."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("content_deploy", Path(__file__).parent / "deploy/run_service.py")
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def snapshot(self, video=False):
        source = self.root / "public"
        (source / "profile").mkdir(parents=True)
        (source / "posts.json").write_text(json.dumps({"channel": "wizard_loop", "status": "incremental", "posts": []}), encoding="utf-8")
        (source / "profile/profile.json").write_text(json.dumps({"source": "telegram", "status": "current",
            "avatar": "/media/profile/avatar.jpg", "poster": "/media/profile/poster.jpg",
            "video": "/media/profile/profile.mp4" if video else None}), encoding="utf-8")
        for name in ("avatar.jpg", "poster.jpg", "profile.mp4", "unlisted-secret.txt"):
            (source / "profile" / name).write_bytes(b"fixture-bytes")
        (source / "state.json").write_text("private-operational-data", encoding="utf-8")
        return source

    def test_build_environment_has_no_credential_inheritance(self):
        with patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "secret", "POSTS_TELEGRAM_BOT_TOKEN": "secret",
                                     "GITHUB_TOKEN": "secret", "CREDENTIALS_DIRECTORY": "private"}):
            env = deploy.safe_env()
        self.assertNotIn("secret", json.dumps(env))
        self.assertNotIn("CREDENTIALS_DIRECTORY", env)
        self.assertEqual(env["ASTRO_TELEMETRY_DISABLED"], "1")

    def test_only_requested_credentials_are_read(self):
        (self.root / "posts-token").write_text("fixture-placeholder", encoding="utf-8")
        with patch.dict(os.environ, {"CREDENTIALS_DIRECTORY": str(self.root), "GITHUB_TOKEN": "not-inherited"}):
            env = deploy.secret_env({"posts-token": "POSTS_TELEGRAM_BOT_TOKEN"})
        self.assertEqual(env["POSTS_TELEGRAM_BOT_TOKEN"], "fixture-placeholder")
        self.assertNotIn("GITHUB_TOKEN", env)

    def test_snapshot_only_copies_allowlisted_public_files(self):
        source = self.snapshot()
        destination = self.root / "work"
        deploy.copy_public_snapshot(source, destination)
        files = sorted(str(path.relative_to(destination)).replace("\\", "/") for path in destination.rglob("*") if path.is_file())
        self.assertEqual(files, ["public/media/profile/avatar.jpg", "public/media/profile/poster.jpg",
                                 "public/media/profile/profile.json", "src/content/posts.json"])

    def test_video_copied_only_when_manifest_declares_it(self):
        source = self.snapshot(video=True)
        destination = self.root / "work"
        deploy.copy_public_snapshot(source, destination)
        self.assertTrue((destination / "public/media/profile/profile.mp4").exists())

    def test_stale_video_removed_from_build_source(self):
        source = self.snapshot(video=False)
        destination = self.root / "work"
        target = destination / "public/media/profile"
        target.mkdir(parents=True)
        (target / "profile.mp4").write_bytes(b"stale")
        deploy.copy_public_snapshot(source, destination)
        self.assertFalse((target / "profile.mp4").exists())

    def test_fixture_cannot_become_build_input(self):
        source = self.snapshot()
        (source / "posts.json").write_text('{"status":"fixture"}', encoding="utf-8")
        with self.assertRaises(ValueError):
            deploy.copy_public_snapshot(source, self.root / "work")

    def test_external_profile_path_rejected(self):
        source = self.snapshot()
        manifest = json.loads((source / "profile/profile.json").read_text())
        manifest["avatar"] = "https://unverified.example/avatar.jpg"
        (source / "profile/profile.json").write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaises(ValueError):
            deploy.copy_public_snapshot(source, self.root / "work")

    def test_protected_empty_index_builds_to_remove_stale_embeds(self):
        source = self.snapshot()
        (source / "posts.json").write_text(json.dumps({"channel": "wizard_loop", "status": "protected", "posts": []}), encoding="utf-8")
        result = deploy.copy_public_snapshot(source, self.root / "work")
        self.assertEqual(result["postsStatus"], "protected")

    def test_protected_nonempty_index_is_rejected(self):
        source = self.snapshot()
        (source / "posts.json").write_text(json.dumps({"channel": "wizard_loop", "status": "protected", "posts": [{"id": 51}]}), encoding="utf-8")
        with self.assertRaises(ValueError):
            deploy.copy_public_snapshot(source, self.root / "work")

    def test_source_zip_traversal_rejected(self):
        archive = self.root / "unsafe.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("../outside.txt", "unsafe")
        with self.assertRaises(ValueError):
            deploy.unpack_source(archive, self.root / "work")
        self.assertFalse((self.root / "outside.txt").exists())

    def test_static_archive_contains_only_dist_contents(self):
        dist = self.root / "dist"
        dist.mkdir()
        (dist / "index.html").write_text("<h1>Fixture</h1>", encoding="utf-8")
        (self.root / "private.json").write_text("private", encoding="utf-8")
        output = self.root / "static.zip"
        deploy.bundle_static(dist, output)
        with zipfile.ZipFile(output) as bundle:
            self.assertEqual(bundle.namelist(), ["index.html"])

    def test_service_templates_are_gated_and_builder_has_no_credentials(self):
        folder = Path(__file__).parent / "deploy"
        for path in folder.glob("*.service"):
            source = path.read_text(encoding="utf-8")
            self.assertIn("ConditionPathExists=/etc/wizardloop/ENABLE_CONTENT_SYNC", source)
            self.assertNotIn("Environment=TELEGRAM", source)
        build = (folder / "wizardloop-build.service").read_text(encoding="utf-8")
        self.assertNotIn("LoadCredential", build)
        self.assertIn("User=wizardloop-build", build)
        self.assertIn("InaccessiblePaths=/var/lib/wizardloop-content/private /etc/wizardloop/secrets", build)


if __name__ == "__main__":
    unittest.main()
