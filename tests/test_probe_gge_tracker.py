import importlib.util
import json
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "probe_gge_tracker.py"
SPEC = importlib.util.spec_from_file_location("probe_gge_tracker", SCRIPT)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


PRIVATE_NAME = "PrivatePlayer-DoNotLog"
PRIVATE_ID = "987654321"
PRIVATE_TIMESTAMP = "2026-11-06T12:34:56Z"


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class InvalidJsonResponse(FakeResponse):
    def read(self):
        return ('{"player_name":"' + PRIVATE_NAME).encode("utf-8")


class ProbeGgeTrackerRedactionTests(unittest.TestCase):
    def sample_payload(self):
        return {
            "return_code": "0",
            "dungeons": [{
                "kid": 1,
                "position_x": 123,
                "position_y": 456,
                "player_id": PRIVATE_ID,
                "player_name": PRIVATE_NAME,
                "player_might": 1234567,
                "last_attack": PRIVATE_TIMESTAMP,
                "global_available_at": PRIVATE_TIMESTAMP,
                "effective_cooldown_until": PRIVATE_TIMESTAMP,
            }],
            "pagination": {
                "current_page": 1,
                "total_pages": 7,
                "current_items_count": 3,
                "total_items_count": 21,
            },
        }

    def test_summary_keeps_coordinates_and_structure_but_no_dynamic_values(self):
        summary = PROBE.summarize_payload(self.sample_payload())
        rendered = json.dumps(summary)
        self.assertEqual(summary["dungeon_count_in_sample"], 1)
        self.assertEqual(summary["sample_coordinates"], [{"x": 123, "y": 456}])
        self.assertEqual(summary["pagination"]["total_items_count"], 21)
        self.assertTrue(summary["player_metadata_present"])
        self.assertTrue(summary["attack_metadata_present"])
        for secret in (PRIVATE_NAME, PRIVATE_ID, PRIVATE_TIMESTAMP, "1234567"):
            self.assertNotIn(secret, rendered)

    def test_probe_success_never_emits_player_attack_or_cooldown_values(self):
        with patch.object(PROBE, "urlopen", return_value=FakeResponse(self.sample_payload())):
            result = PROBE.probe("E4K_PL1_BETA")
        rendered = json.dumps(result)
        self.assertEqual(result["http_status"], 200)
        self.assertEqual(result["return_code"], "0")
        self.assertTrue(result["ok"])
        self.assertTrue(result["player_metadata_present"])
        self.assertTrue(result["attack_metadata_present"])
        for secret in (PRIVATE_NAME, PRIVATE_ID, PRIVATE_TIMESTAMP, "1234567"):
            self.assertNotIn(secret, rendered)

    def test_untrusted_return_code_is_not_echoed(self):
        payload = self.sample_payload()
        payload["return_code"] = PRIVATE_NAME
        with patch.object(PROBE, "urlopen", return_value=FakeResponse(payload)):
            result = PROBE.probe("E4K_PL1_BETA")
        rendered = json.dumps(result)
        self.assertIsNone(result["return_code"])
        self.assertNotIn(PRIVATE_NAME, rendered)

    def test_http_error_body_is_not_read_or_emitted(self):
        error = HTTPError(
            "https://api.gge-tracker.example/dungeons",
            400,
            "Bad Request",
            hdrs=None,
            fp=BytesIO(json.dumps({"player_name": PRIVATE_NAME, "player_id": PRIVATE_ID}).encode()),
        )
        with patch.object(PROBE, "urlopen", side_effect=error):
            result = PROBE.probe("E4K_PL1")
        rendered = json.dumps(result)
        self.assertEqual(result["http_status"], 400)
        self.assertEqual(result["error_type"], "http_error")
        self.assertNotIn(PRIVATE_NAME, rendered)
        self.assertNotIn(PRIVATE_ID, rendered)

    def test_invalid_json_body_is_not_emitted(self):
        with patch.object(PROBE, "urlopen", return_value=InvalidJsonResponse(None)):
            result = PROBE.probe("E4K_PL1")
        rendered = json.dumps(result)
        self.assertEqual(result["error_type"], "invalid_json")
        self.assertNotIn(PRIVATE_NAME, rendered)

    def test_transport_error_reports_only_exception_type(self):
        with patch.object(PROBE, "urlopen", side_effect=URLError("private endpoint details")):
            result = PROBE.probe("E4K_PL1")
        rendered = json.dumps(result)
        self.assertEqual(result["error_type"], "URLError")
        self.assertNotIn("private endpoint details", rendered)
        self.assertNotIn("api.gge-tracker.com", rendered)

    def test_dynamic_top_level_keys_and_invalid_pagination_are_not_echoed(self):
        payload = {
            PRIVATE_NAME: {"player_id": PRIVATE_ID},
            "dungeons": [],
            "pagination": {
                "current_page": True,
                "total_pages": 2,
                "current_items_count": 0,
                "total_items_count": 0,
            },
        }
        summary = PROBE.summarize_payload(payload)
        rendered = json.dumps(summary)
        self.assertIsNone(summary["pagination"])
        self.assertNotIn(PRIVATE_NAME, rendered)
        self.assertNotIn(PRIVATE_ID, rendered)


if __name__ == "__main__":
    unittest.main()
