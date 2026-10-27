"""Offline behavioral tests. No authenticated Telegram requests."""
import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import posts_sync as sync

CHAT = -1000000000001
BOT = 100000
SEED = {"channel": "wizard_loop", "source": "https://t.me/s/wizard_loop", "status": "verified-snapshot",
        "verifiedAt": "2026-10-27", "posts": [{"id": 51, "title": "Verified manual title", "kind": "Text",
        "url": "https://t.me/Wizard_Loop/51", "note": "Verified source."}]}


def update(number=10, message_id=60, edit=False, **extra):
    message = {"message_id": message_id, "date": 1793102400, "chat": {"id": CHAT, "type": "channel"}, "text": "A public note"}
    message.update(extra)
    return {"update_id": number, "edited_channel_post" if edit else "channel_post": message}


class FakeAPI:
    def __init__(self, batches=None, webhook="", admin=True, protected=False):
        self.batches = iter(batches or [[]])
        self.calls = []
        self.webhook = webhook
        self.admin = admin
        self.protected = protected

    def call(self, method, **params):
        self.calls.append((method, params))
        return {"getWebhookInfo": lambda: {"url": self.webhook},
                "getMe": lambda: {"id": BOT, "is_bot": True},
                "getChat": lambda: {"id": CHAT, "type": "channel", "username": "wizard_loop", "has_protected_content": self.protected},
                "getChatMember": lambda: {"status": "administrator" if self.admin else "member"},
                "getUpdates": lambda: next(self.batches)}[method]()


class IndexTests(unittest.TestCase):
    def setUp(self):
        self.state = sync.initial_state(CHAT, BOT)

    def index(self, updates, seed=SEED, **kwargs):
        self.state = sync.apply_updates(self.state, updates, CHAT)
        return sync.render_index(seed, self.state, timestamp="2026-10-27T12:00:00Z", **kwargs)

    def test_manual_history_preserved_and_not_claimed_complete(self):
        result = self.index([update()])
        self.assertEqual([item["id"] for item in result["posts"]], [60, 51])
        self.assertFalse(result["historyComplete"])
        self.assertEqual(result["verifiedAt"], SEED["verifiedAt"])
        self.assertEqual(result["posts"][1]["origin"], "manual-verified")

    def test_matching_edit_replaces_manual_title_and_date(self):
        result = self.index([update(message_id=51, edit=True, text="Revised title", edit_date=1793102500)])
        self.assertEqual(len(result["posts"]), 1)
        self.assertEqual(result["posts"][0]["title"], "Revised title")
        self.assertIsNotNone(result["posts"][0]["editedAt"])

    def test_out_of_order_replay_and_duplicates_are_idempotent(self):
        batch = [update(12, edit=True, text="Latest"), update(11, text="Earlier")]
        first = self.index(batch)
        replay = self.index(batch, seed=first)
        self.assertEqual(first, replay)
        self.assertEqual(self.state["nextOffset"], 13)
        self.assertEqual(first["posts"][0]["title"], "Latest")

    def test_album_across_batches_and_caption_edit(self):
        first = self.index([update(media_group_id="album", caption="Album caption", text="", photo=[{}])])
        second = self.index([update(11, 61, media_group_id="album", text="", video={"file_id": "not-public"})], seed=first)
        album = second["posts"][0]
        self.assertEqual(album["messageIds"], [60, 61])
        self.assertEqual(album["kind"], "Album")
        self.assertEqual(album["title"], "Album caption")
        self.assertEqual(album["media"], ["Photo", "Video"])
        third = self.index([update(12, 60, edit=True, media_group_id="album", text="", caption="New caption", photo=[{}])], seed=second)
        self.assertEqual(third["posts"][0]["title"], "New caption")

    def test_media_capabilities_are_honest(self):
        result = self.index([update(text="", sticker={"is_animated": True, "file_id": "secret-file"},
                                    caption_entities=[{"type": "custom_emoji", "custom_emoji_id": "secret-emoji"}])])
        item = result["posts"][0]
        self.assertEqual(item["media"], ["Custom emoji", "TGS sticker"])
        self.assertIn("not a guarantee", item["note"])
        self.assertNotIn("secret-", json.dumps(result) + json.dumps(self.state))
        self.assertEqual(sync.media_types({"sticker": {"is_video": True}}), ["WebM sticker"])
        self.assertEqual(sync.media_types({"animation": {"file_id": "x"}, "document": {"file_id": "x"}}), ["Animation"])

    def test_other_chats_and_private_messages_ignored_but_cursor_advances(self):
        result = self.index([update(chat={"id": -999, "type": "channel"}), {"update_id": 11, "message": {"text": "private"}}])
        self.assertEqual(len(result["posts"]), 1)
        self.assertEqual(self.state["nextOffset"], 12)
        self.assertNotIn("private", json.dumps(self.state))

    def test_protected_edit_removes_previously_public_post(self):
        first = self.index([update()])
        result = self.index([update(11, has_protected_content=True)], seed=first)
        self.assertEqual([item["id"] for item in result["posts"]], [51])
        self.assertEqual(self.state["blockedIds"], [60])

    def test_owner_exclusions_apply_to_manual_and_new_posts(self):
        result = self.index([update()], excluded=[51, 60])
        self.assertEqual(result["posts"], [])

    def test_service_events_are_not_posts(self):
        result = self.index([update(text="", new_chat_title="A renamed channel")])
        self.assertEqual(len(result["posts"]), 1)

    def test_plain_text_is_bounded_and_emdash_removed(self):
        result = self.index([update(text="<script>alert(1)</script>" + chr(0x2014) + "x" * 8000)])
        item = result["posts"][0]
        self.assertLessEqual(len(item["title"]), 96)
        self.assertLessEqual(len(item["excerpt"]), 280)
        self.assertNotIn(chr(0x2014), json.dumps(result, ensure_ascii=False))
        self.assertTrue(item["title"].startswith("<script>"))  # Consumer must escape text, never set:html.

    def test_invalid_batch_is_atomic_in_memory(self):
        original = copy.deepcopy(self.state)
        with self.assertRaises(sync.SyncError):
            self.index([update(), update(11, date=-1)])
        self.assertEqual(self.state, original)

    def test_seed_url_cannot_introduce_javascript(self):
        seed = copy.deepcopy(SEED)
        seed["posts"][0]["url"] = "javascript:alert(1)"
        with self.assertRaises(sync.SyncError):
            sync.validate_seed(seed)

    def test_state_cannot_move_between_bots_or_channels(self):
        with self.assertRaises(sync.SyncError):
            sync.validate_state(self.state, CHAT, 999)


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "posts.json"
        self.private = self.root / "private"

    def test_authoritative_protection_hides_index_without_polling_or_advancing_state(self):
        sync.run_sync(FakeAPI([[update()]]), SEED, self.output, self.private)
        before = (self.private / "state.json").read_bytes()
        seed = sync.read_json(self.output)
        api = FakeAPI(protected=True)
        result = sync.run_sync(api, seed, self.output, self.private)
        index = sync.read_json(self.output)
        self.assertEqual(result["status"], "protected")
        self.assertEqual(index["status"], "protected")
        self.assertEqual(index["posts"], [])
        self.assertIn("checkedAt", index)
        self.assertNotIn("getUpdates", [method for method, params in api.calls])
        self.assertEqual((self.private / "state.json").read_bytes(), before)
        self.assertEqual(sync.read_json(self.private / "last-public-index.json"), seed)
        self.assertNotIn("channelId", self.output.read_text())

    def test_repeated_protection_preserves_private_seed_and_restores_after_unprotection(self):
        sync.run_sync(FakeAPI(protected=True), SEED, self.output, self.private)
        private_seed = (self.private / "last-public-index.json").read_bytes()
        sync.run_sync(FakeAPI(protected=True), sync.read_json(self.output), self.output, self.private)
        self.assertEqual((self.private / "last-public-index.json").read_bytes(), private_seed)
        api = FakeAPI([[update()]])
        result = sync.run_sync(api, sync.read_json(self.output), self.output, self.private)
        self.assertEqual(result["status"], "incremental")
        self.assertEqual([item["id"] for item in sync.read_json(self.output)["posts"]], [60, 51])
        self.assertEqual(sync.read_json(self.private / "state.json")["nextOffset"], 11)

    def test_owner_exclusion_still_applies_after_protection_is_removed(self):
        sync.run_sync(FakeAPI(protected=True), SEED, self.output, self.private)
        sync.run_sync(FakeAPI([[]]), sync.read_json(self.output), self.output, self.private, excluded=[51])
        self.assertEqual(sync.read_json(self.output)["posts"], [])

    def test_failed_protection_output_write_does_not_acknowledge_updates(self):
        sync.atomic_json(self.output, SEED)
        api = FakeAPI(protected=True)
        original_write = sync.atomic_json
        def write(path, value, private=False):
            if path == self.output:
                raise OSError("public output unavailable")
            original_write(path, value, private)
        with patch.object(sync, "atomic_json", side_effect=write):
            with self.assertRaises(OSError):
                sync.run_sync(api, SEED, self.output, self.private)
        self.assertEqual(sync.read_json(self.output), SEED)
        self.assertNotIn("getUpdates", [method for method, params in api.calls])
        self.assertEqual(sync.read_json(self.private / "state.json")["nextOffset"], None)

    def test_real_fixture_offline_two_batches(self):
        batches = sync.read_json(Path(__file__).parent / "fixtures/updates.json")
        result = sync.run_sync(None, SEED, self.output, self.private, fixture_batches=batches)
        index = sync.read_json(self.output)
        self.assertEqual(result["status"], "fixture")
        self.assertEqual(result["updatesProcessed"], 4)
        self.assertEqual(len(index["posts"]), 3)
        self.assertEqual(index["posts"][0]["messageIds"], [102, 103])
        self.assertEqual(index["posts"][1]["title"], "Offline fixture: edited studio note")
        self.assertNotIn("file_id", self.output.read_text())
        self.assertNotIn("channelId", self.output.read_text())

    def test_cursor_persisted_before_next_request_ack(self):
        batch = [update(number=number, message_id=number + 100) for number in range(1, 101)]
        api = FakeAPI([batch, []])
        original_call = api.call

        def checking_call(method, **params):
            if method == "getUpdates" and "offset" in params:
                self.assertEqual(sync.read_json(self.private / "state.json")["nextOffset"], 101)
                self.assertEqual(len(sync.read_json(self.output)["posts"]), 101)
            return original_call(method, **params)

        api.call = checking_call
        sync.run_sync(api, SEED, self.output, self.private)
        polls = [params for method, params in api.calls if method == "getUpdates"]
        self.assertNotIn("offset", polls[0])
        self.assertEqual(polls[1]["offset"], 101)
        self.assertEqual(polls[0]["allowed_updates"], ["channel_post", "edited_channel_post"])

    def test_failed_output_write_does_not_advance_cursor(self):
        state = sync.initial_state(CHAT, BOT)
        sync.atomic_json(self.private / "state.json", state)
        with patch.object(sync, "atomic_json", side_effect=OSError("write failed")):
            with self.assertRaises(OSError):
                sync.run_sync(FakeAPI([[update()]]), SEED, self.output, self.private)
        self.assertEqual(sync.read_json(self.private / "state.json")["nextOffset"], None)

    def test_failed_cursor_write_replays_without_losing_output(self):
        original_write = sync.atomic_json

        def write(path, value, private=False):
            if private:
                raise OSError("state unavailable")
            original_write(path, value)

        with patch.object(sync, "atomic_json", side_effect=write):
            with self.assertRaises(OSError):
                sync.run_sync(FakeAPI([[update()]]), SEED, self.output, self.private)
        valid_index = sync.read_json(self.output)
        sync.run_sync(FakeAPI([[update()]]), valid_index, self.output, self.private)
        self.assertEqual(len(sync.read_json(self.output)["posts"]), 2)
        self.assertEqual(sync.read_json(self.private / "state.json")["nextOffset"], 11)

    def test_network_failure_preserves_last_good(self):
        sync.atomic_json(self.output, SEED)
        before = self.output.read_bytes()
        api = FakeAPI()
        api.call = lambda *args, **kwargs: (_ for _ in ()).throw(sync.SyncError("api_unavailable_after_retries"))
        with self.assertRaises(sync.SyncError):
            sync.run_sync(api, SEED, self.output, self.private)
        self.assertEqual(before, self.output.read_bytes())

    def test_lock_prevents_concurrent_writers(self):
        with sync.lock(self.private):
            with self.assertRaises(sync.SyncError):
                with sync.lock(self.private):
                    pass
        self.assertFalse((self.private / ".lock").exists())

    def test_fixture_refuses_real_content_output(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = sync.main(["--fixture", "unused.json", "--state-dir", str(self.private)])
        self.assertEqual(result, 1)
        self.assertIn("fixture_requires_separate_output", output.getvalue())

    def test_live_refuses_public_private_state(self):
        with contextlib.redirect_stdout(io.StringIO()):
            result = sync.main(["--live", "--state-dir", str(sync.ROOT / "public/state")])
        self.assertEqual(result, 1)


class TransportTests(unittest.TestCase):
    def api(self):
        return sync.BotAPI("123456:" + "x" * 30, sleep=lambda delay: None)

    def test_webhook_is_never_removed(self):
        api = FakeAPI(webhook="https://private.example/hook")
        with self.assertRaises(sync.SyncError):
            sync.verify_channel(api)
        self.assertEqual([method for method, params in api.calls], ["getWebhookInfo"])

    def test_minimum_configured_admin_membership_enforced(self):
        with self.assertRaises(sync.SyncError):
            sync.verify_channel(FakeAPI(admin=False))

    def test_timeout_retry_is_bounded(self):
        api = self.api()
        with patch.object(api, "_once", side_effect=sync.Retryable()) as request:
            with self.assertRaisesRegex(sync.SyncError, "api_unavailable_after_retries"):
                api.call("getMe")
        self.assertEqual(request.call_count, 3)

    def test_transient_retry_can_succeed(self):
        api = self.api()
        with patch.object(api, "_once", side_effect=[sync.Retryable(2), {"id": BOT}]) as request:
            self.assertEqual(api.call("getMe"), {"id": BOT})
        self.assertEqual(request.call_count, 2)

    def test_request_secret_not_in_error(self):
        api = self.api()
        api._opener.open = lambda *args, **kwargs: (_ for _ in ()).throw(urllib.error.URLError("secret-token-or-url"))
        with self.assertRaises(sync.SyncError) as caught:
            api.call("getMe")
        self.assertNotIn("secret", str(caught.exception))
        self.assertNotIn("123456", str(caught.exception))

    def test_redirect_is_rejected(self):
        with self.assertRaises(sync.SyncError):
            sync.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://evil.example")

    def test_unapproved_method_cannot_send_or_delete(self):
        with self.assertRaisesRegex(sync.SyncError, "api_method_not_allowed"):
            self.api().call("sendMessage")

    def test_rate_limit_large_wait_stops_without_sleep(self):
        api = self.api()
        response = io.BytesIO(json.dumps({"ok": False, "error_code": 429, "parameters": {"retry_after": 400}}).encode())
        response.__enter__ = lambda: response
        api._opener.open = lambda *args, **kwargs: response
        with self.assertRaisesRegex(sync.SyncError, "api_backoff_required"):
            api.call("getMe")


if __name__ == "__main__":
    unittest.main()
