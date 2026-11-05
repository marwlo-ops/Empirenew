import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import_it1_fortresses.py"
SPEC = importlib.util.spec_from_file_location("import_it1_fortresses", SCRIPT)
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class ImportIt1FortressesTests(unittest.TestCase):
    def test_accepts_supported_top_level_shapes(self):
        rows = [{"kid": 1, "position_x": 10, "position_y": 20}]
        self.assertEqual(IMPORTER.records_from(rows), rows)
        self.assertEqual(IMPORTER.records_from({"dungeons": rows}), rows)
        self.assertEqual(IMPORTER.records_from({"data": {"items": rows}}), rows)

    def test_rejects_unknown_response_shape(self):
        self.assertIsNone(IMPORTER.records_from({"unexpected": []}))
        self.assertIsNone(IMPORTER.records_from(None))

    def test_normalizes_known_kingdom_and_coordinates(self):
        point = IMPORTER.normalize({
            "id": 77, "kid": 2, "position_x": 123, "position_y": 456,
            "attacked_at": "must-not-be-imported",
            "cooldown": 999
        })
        self.assertEqual(
            point,
            {
                "id": "77", "kid": 2, "x": 123, "y": 456,
                "kingdom": "ice", "source_server": "IT1",
                "source": "GGE Tracker map data",
                "match_verified_on_target": False
            }
        )
        self.assertNotIn("attacked_at", point)
        self.assertNotIn("cooldown", point)

    def test_generates_stable_id_when_source_id_is_missing(self):
        point = IMPORTER.normalize({"kid": 3, "x": 8, "y": 9})
        self.assertEqual(point["id"], "it1-3-8-9")

    def test_rejects_unknown_kingdom_and_invalid_coordinates(self):
        self.assertIsNone(IMPORTER.normalize({"kid": 4, "x": 1, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": -1, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": "bad", "y": 2}))

    def test_does_not_accept_fractional_coordinate_strings(self):
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": "1.5", "y": 2}))


if __name__ == "__main__":
    unittest.main()
