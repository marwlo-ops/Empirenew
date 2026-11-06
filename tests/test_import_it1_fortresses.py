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

    def test_validates_gge_tracker_pagination_metadata(self):
        payload = {
            "pagination": {
                "current_page": 1,
                "total_pages": 2,
                "current_items_count": 4000,
                "total_items_count": 5000,
            }
        }
        self.assertEqual(
            IMPORTER.pagination_info(payload),
            {
                "current_page": 1,
                "total_pages": 2,
                "current_items_count": 4000,
                "total_items_count": 5000,
            },
        )

    def test_rejects_incomplete_or_boolean_pagination_metadata(self):
        incomplete = {"pagination": {"current_page": 1, "total_pages": 1}}
        boolean_page = {
            "pagination": {
                "current_page": True,
                "total_pages": 1,
                "current_items_count": 1,
                "total_items_count": 1,
            }
        }
        with self.assertRaises(RuntimeError):
            IMPORTER.pagination_info(incomplete)
        with self.assertRaises(RuntimeError):
            IMPORTER.pagination_info(boolean_page)

    def test_accepts_legacy_payload_without_pagination_metadata(self):
        self.assertIsNone(IMPORTER.pagination_info({"dungeons": []}))

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

    def test_normalizes_live_gge_tracker_row_and_strips_dynamic_state(self):
        # Mirrors the public IT1 API shape: coordinates plus dynamic fields,
        # but no area_type/id. Only map coordinates may enter the public catalog.
        point = IMPORTER.normalize({
            "kid": 3, "position_x": 671, "position_y": 779,
            "player_id": 12345, "player_name": "synthetic-test-only",
            "player_might": 999999, "total_attack_count": 12,
            "available_duration_seconds": 3600,
            "global_available_at": "2030-01-01T00:00:00Z",
            "effective_cooldown_until": "2030-01-01T00:00:00Z",
            "last_attack": {"attacked_at": "2030-01-01T00:00:00Z"},
            "distance": 1,
        })
        self.assertEqual(
            point,
            {
                "id": "it1-3-671-779", "kid": 3, "kingdom": "fire",
                "x": 671, "y": 779, "type": "dungeon",
                "source_server": "IT1",
            }
        )
        forbidden = {
            "player_id", "player_name", "player_might", "total_attack_count",
            "available_duration_seconds", "global_available_at",
            "effective_cooldown_until", "last_attack", "attacked_at", "distance",
        }
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

    def test_generates_coordinate_id_when_source_id_is_blank_and_uses_next_nonblank_id(self):
        blank = IMPORTER.normalize({"id": "  ", "kid": 3, "x": 8, "y": 9})
        self.assertEqual(blank["id"], "it1-3-8-9")
        fallback = IMPORTER.normalize({"id": "", "dungeon_id": 77, "kid": 3, "x": 8, "y": 9})
        self.assertEqual(fallback["id"], "77")

    def test_rejects_duplicate_stable_ids_before_catalog_write(self):
        points = [
            {"id": "same", "kid": 1, "x": 10, "y": 20},
            {"id": "same", "kid": 2, "x": 30, "y": 40},
        ]
        with self.assertRaisesRegex(RuntimeError, "Duplicate IT1 fortress ID same"):
            IMPORTER.validate_unique_ids(points)
        with self.assertRaisesRegex(RuntimeError, "Invalid IT1 fortress ID"):
            IMPORTER.validate_unique_ids([{"id": "  "}])

    def test_rejects_unknown_kingdom_and_invalid_coordinates(self):
        self.assertIsNone(IMPORTER.normalize({"kid": 4, "x": 1, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": -1, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": "bad", "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": 1287, "y": 2}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": 2, "y": 1287}))

    def test_does_not_accept_fractional_coordinate_strings(self):
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": "1.5", "y": 2}))

    def test_rejects_boolean_kingdom_and_coordinates(self):
        self.assertIsNone(IMPORTER.normalize({"kid": True, "x": 10, "y": 20}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": False, "y": 20}))
        self.assertIsNone(IMPORTER.normalize({"kid": 1, "x": 10, "y": True}))


if __name__ == "__main__":
    unittest.main()
