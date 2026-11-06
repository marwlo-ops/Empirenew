import os
import unittest
from unittest.mock import patch

from scripts.scan_npc_map import DEFAULT_SERVER, ProbeError, request_command


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
            fp=BytesIO(b'{"error":"Unauthorized"}'),
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


if __name__ == "__main__":
    unittest.main()
