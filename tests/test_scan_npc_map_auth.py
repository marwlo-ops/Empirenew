import os
import unittest
from unittest.mock import patch

from scripts.scan_npc_map import (DEFAULT_SERVER, ProbeError, build_map_command_plan,
                                  extract_explicit_npcs, main, request_bridge_status,
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
            "type_name": "PrivatePlayer Dungeon",
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

    def test_bridge_status_returns_only_target_boolean_and_server_count(self):
        class StatusResponse(FakeResponse):
            def read(self):
                return b'{"EmpirefourkingdomsExGG_3":false,"IT1":true,"PrivatePlayer":"secret"}'

        with patch.dict(os.environ, {}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", return_value=StatusResponse()
        ) as mocked:
            result = request_bridge_status("https://bridge.example.invalid", DEFAULT_SERVER, 5)
            request = mocked.call_args.args[0]

        self.assertEqual(result, {
            "http_status": 200,
            "target_connected": False,
            "known_server_count": 3,
        })
        self.assertNotIn("PrivatePlayer", str(result))
        self.assertNotIn("secret", str(result))
        self.assertEqual(request.full_url, "https://bridge.example.invalid/status")

    def test_bridge_status_missing_or_non_boolean_target_is_unknown(self):
        class StatusResponse(FakeResponse):
            def read(self):
                return b'{"EmpirefourkingdomsExGG_3":"false","IT1":true}'

        with patch.dict(os.environ, {}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", return_value=StatusResponse()
        ):
            result = request_bridge_status("https://bridge.example.invalid", DEFAULT_SERVER, 5)

        self.assertIsNone(result["target_connected"])
        self.assertEqual(result["known_server_count"], 2)

    def test_bridge_status_sends_bearer_token_only_in_authorization_header(self):
        class StatusResponse(FakeResponse):
            def read(self):
                return b'{"EmpirefourkingdomsExGG_3":true}'

        with patch.dict(os.environ, {"E4K_API_TOKEN": TOKEN}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", return_value=StatusResponse()
        ) as mocked:
            result = request_bridge_status("https://bridge.example.invalid", DEFAULT_SERVER, 5)
            request = mocked.call_args.args[0]

        self.assertTrue(result["target_connected"])
        self.assertEqual(request.get_header("Authorization"), f"Bearer {TOKEN}")
        self.assertNotIn(TOKEN, request.full_url)

    def test_bridge_status_http_error_does_not_echo_body_or_token(self):
        from io import BytesIO
        from urllib.error import HTTPError

        error = HTTPError(
            "https://bridge.example.invalid/status",
            500,
            "Unavailable",
            hdrs=None,
            fp=BytesIO(b'{"player_name":"PrivatePlayer","token":"secret"}'),
        )
        with patch.dict(os.environ, {"E4K_API_TOKEN": TOKEN}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", side_effect=error
        ):
            with self.assertRaises(ProbeError) as raised:
                request_bridge_status("https://bridge.example.invalid", DEFAULT_SERVER, 5)

        self.assertNotIn(TOKEN, str(raised.exception))
        self.assertNotIn("PrivatePlayer", str(raised.exception))
        self.assertNotIn("secret", str(raised.exception))

    def test_bridge_status_invalid_json_does_not_echo_body(self):
        class InvalidStatusResponse(FakeResponse):
            def read(self):
                return b'{"player_name":"PrivatePlayer"'

        with patch.dict(os.environ, {}, clear=True), patch(
            "scripts.scan_npc_map.urlopen", return_value=InvalidStatusResponse()
        ):
            with self.assertRaises(ProbeError) as raised:
                request_bridge_status("https://bridge.example.invalid", DEFAULT_SERVER, 5)

        self.assertNotIn("PrivatePlayer", str(raised.exception))

    def test_map_command_plan_skips_disconnected_unknown_and_unmapped_commands(self):
        disconnected = build_map_command_plan(False, 1, 0, 0, 12)
        unknown = build_map_command_plan(None, 1, 0, 0, 12)
        connected = build_map_command_plan(True, 1, 0, 0, 12)

        self.assertEqual([item["command"] for item in disconnected], ["gaa", "fnm"])
        self.assertTrue(all(item["skip_reason"] == "target_socket_not_connected" for item in disconnected))
        self.assertTrue(all(item["skip_reason"] == "bridge_status_unavailable_or_target_unknown" for item in unknown))
        self.assertTrue(all(item["skip_reason"] == "bridge_response_key_mapping_missing" for item in connected))

    def test_main_does_not_send_unmapped_gaa_or_fnm_even_when_connected(self):
        import io

        with patch(
            "scripts.scan_npc_map.request_bridge_status",
            return_value={"http_status": 200, "target_connected": True, "known_server_count": 82},
        ), patch("scripts.scan_npc_map.request_command") as command, patch(
            "scripts.scan_npc_map.atomic_write"
        ) as write, patch(
            "sys.argv", ["scan_npc_map.py", "--diagnostic", "diagnostic.json"]
        ), patch("sys.stdout", io.StringIO()):
            exit_code = main()

        self.assertEqual(exit_code, 2)
        command.assert_not_called()
        report = write.call_args.args[1]
        self.assertEqual(report["validated_npc_count"], 0)
        self.assertFalse(report["snapshot_written"])
        self.assertTrue(all(item["skipped"] for item in report["tests"]))
        self.assertTrue(all(
            item["reason"] == "bridge_response_key_mapping_missing"
            for item in report["tests"]
        ))


if __name__ == "__main__":
    unittest.main()
