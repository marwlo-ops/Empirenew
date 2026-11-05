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

## Status danych — aktualizacja 2026-11-05

| Kraina | Katalog współrzędnych IT1 | Liczba | Potwierdzenie dla E4K PL1 |
|---|---:|---:|---|
| Płonące Piaski | Tak | 671 | Nie |
| Wieczny Lód | Tak | 779 | Nie |
| Ogniste Szczyty | Tak | 571 | Nie |
| **Łącznie** | **Tak** | **2021** | **Nie** |

Katalog został pobrany z publicznego API GGE Tracker dla serwera **IT1**. Odczyt z 2026-11-05 14:16:52 UTC zwrócił jedną stronę i 2021 unikalnych lokalizacji. Kontrola pliku opublikowanego w repozytorium potwierdziła 0 duplikatów, 0 niepoprawnych współrzędnych i brak pól gracza, ataku, cooldownu lub gotowości. Współrzędne nie są potwierdzone dla E4K PL1.

Testy zgodności API z 2026-11-05:
- `gge-server: IT1` na `GET /dungeons` — HTTP 200; użyte do importu mapy.
- `gge-server: E4K_PL1` — HTTP 400; odpowiedź wymienia `E4K_PL1_BETA`, ale nie produkcyjne `E4K_PL1`.
- `gge-server: EmpirefourkingdomsExGG2_3` oraz `PL1` — HTTP 400 (nieprawidłowa nazwa serwera w GGE Tracker).
- Nie wolno zastępować produkcyjnego PL1 serwerem BETA.

Źródło GGE Tracker ma w rekordach lochów pola `last_attack`, `last_attacker_id` i `total_attack_count`, ale są one dostępne tylko dla serwerów obsługiwanych przez ich bazę. Endpoint `/dungeons` odrzuca produkcyjny E4K PL1; jego komunikat o dozwolonych serwerach zawiera E4K_PL1_BETA, ale nie produkcyjny E4K_PL1. Endpoint `/servers` zwraca 63 pozycje i ma dokładne wpisy `E4K_PL1` oraz `E4K_PL1_BETA`; nie jest to jednak allowlista endpointu `/dungeons`. Ten drugi dla produkcyjnego nagłówka nadal zwraca HTTP 400, a jego komunikat dopuszcza tylko `E4K_PL1_BETA`.

Publiczny most `empire-api.fly.dev` pochodzi z upstream `danadum/empire-api`. Jego aktualna mapa komend nie zawiera `gaa` ani `fnm`; dla nieznanej komendy używa całego nagłówka żądania jako wzorca odpowiedzi i ma timeout 1000 ms. Dokumentacja protokołu mapy potwierdza, że `gaa` przyjmuje `KID, AX1, AY1, AX2, AY2`, a odpowiedź może zawierać dodatkowe pola `AI`, `OI` i `uap`. Fork mostu GGE Tracker ma już osobne dopasowanie `gaa` tylko po `KID`. Test mostu z 2026-11-05 potwierdził `/status` HTTP 200 i aktywne połączenie serwera `EmpirefourkingdomsExGG2_3`. Dwa bezpieczne zapytania read-only — `gaa` na obszarze 2×2 i `fnm` dla DUNGEON/-202 — zwróciły HTTP 400 `Invalid command or headers`. To potwierdza, że sam socket PL1 jest połączony, ale publiczny most nie obsługuje obecnie poprawnie tych komend.

Skanowanie przez EmpireCore pozostaje opisem technicznej metody dla klienta gry, a nie wykonanym skanem E4K PL1. Wymaga aktywnej sesji gry i oddzielnego testu zgodności z E4K. Nie zapisujemy wyniku takiego skanu, dopóki nie przejdzie testu.

## Źródła

- EmpireCore — map scanning: https://eschnitzler.github.io/EmpireCore/guides/map-scanning/
- EmpireCore — map enums: https://raw.githubusercontent.com/eschnitzler/EmpireCore/master/src/empire_core/enums/map.py
- EmpireCore — source: https://github.com/eschnitzler/EmpireCore
