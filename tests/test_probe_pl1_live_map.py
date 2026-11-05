import importlib.util
import io
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from types import SimpleNamespace

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "probe-pl1-live-map.py"
SPEC = importlib.util.spec_from_file_location("probe_pl1_live_map", SCRIPT)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


def valid_catalog():
    groups = {}
    for name, kid in (("sands", 1), ("ice", 2), ("fire", 3)):
        points = [{"id": f"it1-{kid}-10-20", "kid": kid, "x": 10, "y": 20,
                   "kingdom": name, "source_server": "IT1", "type": "dungeon"}]
        groups[name] = {"complete": True, "fortress_count": 1, "fortresses": points}
    return {"complete": True, "server_source": "IT1", "total_count": 3, "results": groups}


class ProbePl1LiveMapTests(unittest.TestCase):
    def test_validates_complete_map_only_catalog(self):
        groups = PROBE.validate_catalog(valid_catalog())
        self.assertEqual(set(groups), {"sands", "ice", "fire"})
        self.assertEqual(sum(map(len, groups.values())), 3)

    def test_rejects_incomplete_catalog(self):
        catalog = valid_catalog()
        catalog["complete"] = False
        with self.assertRaises(ValueError):
            PROBE.validate_catalog(catalog)

    def test_rejects_attack_or_player_fields_in_it1_catalog(self):
        catalog = valid_catalog()
        catalog["results"]["sands"]["fortresses"][0]["last_attack"] = "not allowed"
        with self.assertRaises(ValueError):
            PROBE.validate_catalog(catalog)

    def test_rejects_wrong_kingdom_group_or_source(self):
        catalog = valid_catalog()
        catalog["results"]["sands"]["fortresses"][0]["kid"] = 2
        with self.assertRaises(ValueError):
            PROBE.validate_catalog(catalog)

    def test_rejects_coordinates_outside_map_bounds(self):
        catalog = valid_catalog()
        catalog["results"]["sands"]["fortresses"][0]["x"] = 1287
        with self.assertRaises(ValueError):
            PROBE.validate_catalog(catalog)

    def test_rejects_duplicate_coordinates(self):
        catalog = valid_catalog()
        duplicate = dict(catalog["results"]["sands"]["fortresses"][0])
        catalog["results"]["sands"]["fortresses"].append(duplicate)
        catalog["results"]["sands"]["fortress_count"] = 2
        catalog["total_count"] = 4
        with self.assertRaises(ValueError):
            PROBE.validate_catalog(catalog)

    def test_evenly_selects_samples_without_duplicates(self):
        points = [{"x": i, "y": i} for i in range(10)]
        chosen = PROBE.pick_samples(points, 3)
        self.assertEqual([p["x"] for p in chosen], [0, 5, 9])

    def test_single_sample_uses_middle_point(self):
        points = [{"x": i, "y": i} for i in range(5)]
        self.assertEqual(PROBE.pick_samples(points, 1)[0]["x"], 2)

    def test_rejects_sample_count_outside_safe_range(self):
        with self.assertRaises(ValueError):
            PROBE.pick_samples([], 0)
        with self.assertRaises(ValueError):
            PROBE.pick_samples([], 11)

    def test_map_row_keeps_cooldown_raw_but_does_not_invent_attack_time(self):
        item = SimpleNamespace(
            item_type=SimpleNamespace(name="DUNGEON"),
            x=10, y=20, owner_id=-220, dungeon_level=15,
            attack_cooldown_seconds=3600, total_cooldown_seconds=86400,
            victory_count=7, defeater_player_id=None, is_defeated=True,
            raw_data=[2, 10, 20, 15],
        )
        row = PROBE.serialize_map_item(item)
        self.assertEqual(row["attack_cooldown_seconds"], 3600)
        self.assertIsNone(row["attack_time"])
        self.assertFalse(row["boss_defeater_lookup_applicable"])
        self.assertNotIn("attacked_at", row)

    def test_boss_defeater_id_is_scoped_to_boss_dungeon(self):
        item = SimpleNamespace(
            item_type=SimpleNamespace(name="BOSS_DUNGEON"),
            x=1, y=2, owner_id=-300, dungeon_level=1,
            attack_cooldown_seconds=None, total_cooldown_seconds=None,
            victory_count=1, defeater_player_id=12345, is_defeated=True,
            raw_data=[11, 1, 2],
        )
        row = PROBE.serialize_map_item(item)
        self.assertTrue(row["boss_defeater_lookup_applicable"])
        self.assertEqual(row["defeater_player_id"], 12345)

    def test_missing_exact_row_is_not_confirmed_not_a_fake_event(self):
        target = {"id": "it1-1-10-20", "kid": 1, "kingdom": "sands", "x": 10, "y": 20}
        item = SimpleNamespace(x=11, y=20, item_type=SimpleNamespace(name="DUNGEON"))
        result = PROBE.build_sample_result(target, [item], [], "2026-11-05T14:00:00+00:00")
        self.assertEqual(result["status"], "not_confirmed")
        self.assertEqual(result["rows"], [])
        self.assertIn("not proof", result["note"].lower())

    def test_legacy_empirecore_probe_refuses_e4k_before_credentials_or_network(self):
        stderr = io.StringIO()
        args = SimpleNamespace(zone="EmpirefourkingdomsExGG_3", game_id=None, network_id=None)
        with redirect_stderr(stderr):
            result = PROBE.run_probe(args)
        self.assertEqual(result, 2)
        self.assertIn("TCP", stderr.getvalue())
        self.assertIn("node scripts/barony-live/probe.mjs", stderr.getvalue())
        self.assertIn("No credentials were read", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
