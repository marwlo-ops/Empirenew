# Katalog fortec baronów — procedura skanowania

## Cel

Zebrać współrzędne zamków baronów (NPC dungeons) w trzech krainach:
- Płonące Piaski (`Kingdom.SANDS`)
- Wieczny Lód / Zimowa Kraina (`Kingdom.ICE`)
- Ogniste Szczyty (`Kingdom.FIRE`)

## Co potwierdza dokumentacja EmpireCore

Dokumentacja biblioteki opisuje:
- `client.map.scan_kingdom(kingdom, item_types=[MapItemType.DUNGEON])` — skan królestwa,
- `client.map.scan_around(x, y, radius, kingdom, [MapItemType.DUNGEON])` — skan wokół pozycji,
- `MapItemType.DUNGEON = 2` — zamek/obóz NPC, potocznie zamek barona,
- `NPCOwner.ROBBER_BARON = -202` — rodzina zwykłych baronów obejmuje ID od -202 do -214,
- krainowe lochy mają osobne identyfikatory właścicieli: `DESERT_DUNGEON = -220`, `ICE_DUNGEON = -221`, `VOLCANO_DUNGEON = -222`.

**Ważne:** filtruj po typie obiektu i właścicielu NPC. Nie każdy obiekt `DUNGEON` jest zwykłą fortecą barona. Krainowe lochy i wydarzenia mogą być odrębnymi obiektami.

## Wymagania

1. Zainstalowana biblioteka EmpireCore zgodna z aktualną dokumentacją.
2. Aktywna sesja klienta gry; konto musi mieć odblokowaną skanowaną krainę.
3. Nie umieszczaj hasła ani tokenu konta w repozytorium. Korzystaj z lokalnej konfiguracji/zmiennych środowiskowych.
4. Skanuj krainy kolejno i sprawdzaj `failed_chunks`. Niepełny skan nie oznacza, że brak fortec.

## Przykładowy skrypt

Poniższy kod zakłada, że `client` jest już poprawnie zalogowanym klientem EmpireCore. Sam nie loguje się i nie pobiera poświadczeń.

```python
import json
from datetime import datetime, timezone
from pathlib import Path

from empire_core import Kingdom, MapItemType, NPCOwner

KINGDOMS = {
    "sands": Kingdom.SANDS,
    "ice": Kingdom.ICE,
    "fire": Kingdom.FIRE,
}

BARON_OWNER_IDS = set(range(-214, -201))  # -214 ... -202

def scan_baron_fortresses(client):
    captured_at = datetime.now(timezone.utc).isoformat()
    output = {
        "captured_at": captured_at,
        "source": "EmpireCore live kingdom scan",
        "results": {},
    }

    for name, kingdom in KINGDOMS.items():
        result = client.map.scan_kingdom(
            kingdom,
            item_types=[MapItemType.DUNGEON],
            timeout=900,
        )

        fortresses = []
        for item in result.items:
            owner_id = getattr(item, "owner_id", None)
            if owner_id in BARON_OWNER_IDS:
                fortresses.append({
                    "kingdom": name,
                    "x": item.x,
                    "y": item.y,
                    "owner_id": owner_id,
                    "item_type": int(item.item_type),
                    "level": getattr(item, "level", None),
                })

        output["results"][name] = {
            "fortress_count": len(fortresses),
            "failed_chunks": [list(chunk) for chunk in result.failed_chunks],
            "complete": len(result.failed_chunks) == 0,
            "fortresses": fortresses,
        }

    Path("baron-fortresses.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output
```

## Schemat danych

Każdy odczyt powinien zachować:
- krainę,
- współrzędne `x`, `y`,
- `owner_id`,
- typ obiektu,
- poziom, jeśli jest dostępny w rekordzie,
- datę i czas odczytu,
- liczbę nieudanych fragmentów skanu,
- informację, czy skan jest kompletny.

## Status danych

| Kraina | Skan wykonany | Współrzędne potwierdzone |
|---|---|---|
| Płonące Piaski | Nie | Nie |
| Wieczny Lód | Nie | Nie |
| Ogniste Szczyty | Nie | Nie |

Na dzień 2026-11-04 nie posiadamy jeszcze rzeczywistych wyników skanowania tych trzech krain. Ten dokument opisuje zweryfikowaną metodę, a nie gotową listę lokalizacji.

## Źródła

- EmpireCore — map scanning: https://eschnitzler.github.io/EmpireCore/guides/map-scanning/
- EmpireCore — map enums: https://raw.githubusercontent.com/eschnitzler/EmpireCore/master/src/empire_core/enums/map.py
- EmpireCore — source: https://github.com/eschnitzler/EmpireCore
