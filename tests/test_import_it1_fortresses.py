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

    def test_normalizes_known_kingdom_to_public_map_only_schema(self):
        point = IMPORTER.normalize({
            "id": 77, "kid": 2, "position_x": 123, "position_y": 456,
            "area_type": 11,
            "attacked_at": "must-not-be-imported",
            "cooldown": 999,
            "player_id": 12345,
            "ready_at": "must-not-be-imported",
        })
        self.assertEqual(
            point,
            {
                "id": "77", "kid": 2, "kingdom": "ice",
                "x": 123, "y": 456, "type": "dungeon",
                "source_server": "IT1",
            }
        )
        forbidden = {"attacked_at", "cooldown", "player_id", "ready_at", "source"}
        self.assertTrue(forbidden.isdisjoint(point.keys()))

    def test_rejects_non_boss_dungeon_rows_when_area_type_is_present(self):
        self.assertIsNone(IMPORTER.normalize({
            "kid": 1, "x": 10, "y": 20, "areaType": 2
        }))
        self.assertIsNotNone(IMPORTER.normalize({
            "kid": 1, "x": 10, "y": 20, "areaType": 11
        }))

    def test_generates_stable_id_when_source_id_is_missing(self):
        point = IMPORTER.normalize({"kid": 3, "x": 8, "y": 9})
        self.assertEqual(point["id"], "it1-3-8-9")

    def test_rejects_unknown_kingdom_and_invalid_coordinates(self):
        self.assertIsNone(IMPORTER.normalize({"kid": 4, "x": 1, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": -1, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": "bad", "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": 1287, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": 2, "y": 1287}))

    def test_does_not_accept_fractional_coordinate_strings(self):
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": "1.5", "y": 2}))


if __name__ == "__main__":
    unittest.main()
