import os
import unittest
from unittest.mock import patch

from scripts.scan_npc_map import (DEFAULT_SERVER, ProbeError, extract_explicit_npcs,
                                  request_command, safe_origin, summarize_content)


TOKEN = "0123456789abcdef0123456789abcdef"


class FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return b'{"return_code":"0","content":[]}'


class ScanNpcMapAuthTests(unittest.TestCase):
    def call_with_environment(self, env):
        with patch.dict(os.environ, env, clear=True), patch(
            "scripts.scan_npc_map.urlopen", return_value=FakeResponse()
        ) as mocked:
            result = request_command(
                "https://bridge.example.invalid",
                DEFAULT_SERVER,
                "gaa",
                {"KID": 1},
                5,
            )
            request = mocked.call_args.args[0]
        return result, request

    def test_default_server_is_the_pinned_production_pl1_zone(self):
        self.assertEqual(DEFAULT_SERVER, "EmpirefourkingdomsExGG_3")

    def test_sends_bearer_token_only_in_authorization_header(self):
        result, request = self.call_with_environment({"E4K_API_TOKEN": TOKEN})
        self.assertEqual(result["http_status"], 200)
        self.assertEqual(request.get_header("Authorization"), f"Bearer {TOKEN}")
        self.assertNotIn(TOKEN, request.full_url)

    def test_does_not_add_authorization_header_without_secret(self):
        _, request = self.call_with_environment({})
        self.assertIsNone(request.get_header("Authorization"))

    def test_http_error_does_not_echo_request_headers_or_token(self):
        from io import BytesIO
        from urllib.error import HTTPError

        error = HTTPError(
            "https://bridge.example.invalid/route",
            401,
            "Unauthorized",
            hdrs=None,
            fp=BytesIO(b'{"error":"Unauthorized","player_name":"PrivatePlayer"}'),
        )
        with patch.dict(os.environ, {"E4K_API_TOKEN": TOKEN}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", side_effect=error
        ):
            with self.assertRaises(ProbeError) as raised:
                request_command(
                    "https://bridge.example.invalid",
                    DEFAULT_SERVER,
                    "gaa",
                    {"KID": 1},
                    5,
                )
        self.assertNotIn(TOKEN, str(raised.exception))
        self.assertNotIn("PrivatePlayer", str(raised.exception))

    def test_diagnostic_summary_redacts_player_values(self):
        content = [{
            "x": 17, "y": 29, "type": "BOSS_DUNGEON",
            "player_id": 123456, "player_name": "PrivatePlayer",
            "owner": "PrivateAlliance", "name": "PrivatePlayer",
        }]
        summary = summarize_content(content)
        rendered = str(summary)
        self.assertIn("'x': 17", rendered)
        self.assertIn("'y': 29", rendered)
        self.assertNotIn("PrivatePlayer", rendered)
        self.assertNotIn("PrivateAlliance", rendered)
        self.assertNotIn("123456", rendered)

    def test_explicit_npc_extraction_does_not_copy_player_or_raw_fields(self):
        payload = {"content": [{
            "x": 17, "y": 29, "type": "BOSS_DUNGEON",
            "player_id": 123456, "player_name": "PrivatePlayer",
            "owner": "PrivateAlliance", "name": "PrivatePlayer",
        }]}
        rows = extract_explicit_npcs(payload, 1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["label"], "dungeon")
        self.assertNotIn("raw", rows[0])
        self.assertNotIn("source_path", rows[0])
        self.assertNotIn("player_id", rows[0])
        self.assertNotIn("player_name", rows[0])
        self.assertNotIn("PrivatePlayer", str(rows))
        self.assertNotIn("PrivateAlliance", str(rows))

    def test_summary_does_not_emit_dynamic_object_keys(self):
        content = {
            "PrivatePlayer": {"x": 17, "y": 29, "type": "dungeon"},
        }
        rendered = str(summarize_content(content))
        self.assertNotIn("PrivatePlayer", rendered)
        self.assertIn("top_level_field_count", rendered)

    def test_safe_origin_omits_userinfo_path_query_and_fragment(self):
        origin = safe_origin(
            "https://user:secret@bridge.example.invalid:8443/private/path?token=abc#frag"
        )
        self.assertEqual(origin, "https://bridge.example.invalid:8443")
        self.assertNotIn("user", origin)
        self.assertNotIn("secret", origin)
        self.assertNotIn("token", origin)

    def test_rejects_api_base_with_embedded_credentials(self):
        with self.assertRaises(ProbeError) as raised:
            request_command(
                "https://user:secret@bridge.example.invalid",
                DEFAULT_SERVER,
                "gaa",
                {"KID": 1},
                5,
            )
        self.assertNotIn("user", str(raised.exception))
        self.assertNotIn("secret", str(raised.exception))

    def test_invalid_json_error_does_not_echo_response_body(self):
        class InvalidJsonResponse(FakeResponse):
            def read(self):
                return b'{"player_name":"PrivatePlayer"'

        with patch.dict(os.environ, {}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", return_value=InvalidJsonResponse()
        ):
            with self.assertRaises(ProbeError) as raised:
                request_command(
                    "https://bridge.example.invalid",
                    DEFAULT_SERVER,
                    "gaa",
                    {"KID": 1},
                    5,
                )
        self.assertNotIn("PrivatePlayer", str(raised.exception))

if __name__ == "__main__":
    unittest.main()
