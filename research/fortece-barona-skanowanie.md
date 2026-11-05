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

| Kraina | Katalog współrzędnych IT1 | Liczba | Zgodność współrzędnych z PL1 | Automatyczna historia PL1 |
|---|---:|---:|---|---|
| Płonące Piaski | Tak | 671 | Potwierdzona przez użytkownika | Niepotwierdzona |
| Wieczny Lód | Tak | 779 | Potwierdzona przez użytkownika | Niepotwierdzona |
| Ogniste Szczyty | Tak | 571 | Potwierdzona przez użytkownika | Niepotwierdzona |
| **Łącznie** | **Tak** | **2021** | **Potwierdzona przez użytkownika** | **Niepotwierdzona** |

Katalog został pobrany z publicznego API GGE Tracker dla serwera **IT1**. Odczyt z 2026-11-05 14:20:35 UTC zwrócił jedną stronę i 2021 unikalnych lokalizacji. Kontrola pliku opublikowanego w repozytorium potwierdziła 0 duplikatów, 0 niepoprawnych współrzędnych i brak pól gracza, ataku, cooldownu lub gotowości. Użytkownik potwierdził, że współrzędne IT1 i PL1 pokrywają się. Traktujemy to jako potwierdzenie projektowe od użytkownika, a nie niezależny wynik zapytania produkcyjnego API PL1.

Testy zgodności API z 2026-11-05:
- `gge-server: IT1` na `GET /dungeons` — HTTP 200; użyte do importu mapy.
- `gge-server: E4K_PL1` — HTTP 400; odpowiedź wymienia `E4K_PL1_BETA`, ale nie produkcyjne `E4K_PL1`.
- `gge-server: E4K_PL1_BETA` — HTTP 200, 976 stron przy próbce `size=1`, z polami ataku; tylko porównanie, nie dane produkcyjnego PL1.
- `gge-server: EmpirefourkingdomsExGG2_3` oraz `PL1` — HTTP 400 (nieprawidłowa nazwa serwera w GGE Tracker).
- Nie wolno zastępować produkcyjnego PL1 serwerem BETA.

Źródło GGE Tracker ma w rekordach lochów pola `last_attack`, `last_attacker_id` i `total_attack_count`, ale są one dostępne tylko dla serwerów obsługiwanych przez ich bazę. Endpoint `/dungeons` odrzuca produkcyjny E4K PL1; jego komunikat o dozwolonych serwerach zawiera E4K_PL1_BETA, ale nie produkcyjny E4K_PL1. Endpoint `/servers` zwraca 63 pozycje i ma dokładne wpisy `E4K_PL1` oraz `E4K_PL1_BETA`; nie jest to jednak allowlista endpointu `/dungeons`. Ten drugi dla produkcyjnego nagłówka nadal zwraca HTTP 400, a jego komunikat dopuszcza tylko `E4K_PL1_BETA`.

Publiczny most `empire-api.fly.dev` pochodzi z upstream `danadum/empire-api`. Jego aktualna mapa komend nie zawiera `gaa` ani `fnm`; dla nieznanej komendy używa całego nagłówka żądania jako wzorca odpowiedzi i ma timeout 1000 ms. Dokumentacja protokołu mapy potwierdza, że `gaa` przyjmuje `KID, AX1, AY1, AX2, AY2`, a odpowiedź może zawierać dodatkowe pola `AI`, `OI` i `uap`. Fork mostu GGE Tracker ma już osobne dopasowanie `gaa` tylko po `KID`. Test mostu z 2026-11-05 potwierdził `/status` HTTP 200 i aktywne połączenie serwera `EmpirefourkingdomsExGG2_3`. Dwa bezpieczne zapytania read-only — `gaa` na obszarze 2×2 i `fnm` dla DUNGEON/-202 — zwróciły HTTP 400 `Invalid command or headers`. To potwierdza, że sam socket PL1 jest połączony, ale publiczny most nie obsługuje obecnie poprawnie tych komend.

Skanowanie przez EmpireCore pozostaje opisem technicznej metody dla klienta gry, a nie wykonanym skanem E4K PL1. Wymaga aktywnej sesji gry i oddzielnego testu zgodności z E4K. Nie zapisujemy wyniku takiego skanu, dopóki nie przejdzie testu.


### Rozróżnienie katalogu serwerów i obsługi historii fortec

Kod aktualnego GGE Tracker rozdziela zwykłą obecność serwera w enumie od uprawnienia funkcji fortec:
- Lista identyfikatorów serwerów zawiera zarówno E4K_PL1, jak i E4K_PL1_BETA.
- Endpoint GET /dungeons oraz GET /dungeons/meta dodatkowo sprawdzają flagę funkcji fortress. Sam wpis w /servers nie oznacza więc, że serwer ma włączony tracker fortec.
- Kod odpowiedzi /dungeons mapuje pola last_attack, player_id (z last_attacker_id), player_name i total_attack_count. Endpoint /dungeons/player/{playerId} zwraca historię z kid, position_x, position_y i attacked_at.
- W dotychczasowym teście runtime produkcyjny nagłówek E4K_PL1 otrzymał HTTP 400, a komunikat allowlisty wskazywał E4K_PL1_BETA. Nie wolno używać BETA jako zamiennika produkcyjnego PL1.

### Komenda mapy i publiczny most

Kod GGE Tracker używa komendy gaa z polami KID, AX1, AY1, AX2, AY2; odpowiedź mapy jest czytana z content.AI. W scraperze GGE Tracker wpis typu mapy 11 jest identyfikowany jako dungeon, a wiersz zawiera m.in. współrzędne, pozostały czas i identyfikator gracza. To jest odczyt bieżącego obszaru mapy, nie pełna, historyczna baza ataków.

Fork Empire-API używany przez GGE Tracker ma mapowanie gaa w pliku empire-api/src/data/commands.json. Publiczny most empire-api.fly.dev, którego używa Empirenew, ma starszą mapę komend i wcześniejsze próby gaa zwróciły HTTP 400 Invalid command or headers. Nowy skrypt scripts/probe-baron-pl1.js sprawdza gaa z kompletem pięciu parametrów na małym obszarze w każdej krainie; zapisuje wyłącznie status, liczniki i obecność pól, bez zapisywania identyfikatorów graczy lub zdarzeń. Nie dodajemy fnm, ponieważ nie występuje w mapie komend sprawdzonego forka GGE Tracker.

### Walidacja i publikacja modułu

- scripts/validate-baron-fortresses.js sprawdza liczbę 2021 rekordów, kompletność trzech krain, zakres współrzędnych, duplikaty i brak pól ataku/cooldownu.
- scripts/check-barony-html.js kompiluje składnię skryptów w barony.html i sprawdza viewport, breakpoint mobilny oraz minimalny cel dotykowy 44 px.
- .github/workflows/barony-probe.yml uruchamia te testy oraz read-only probe przy pull requeście. Wynik zapytań runtime jest raportowany w logu Actions; nie dopisuje historii ataków do danych strony.

## Źródła

- EmpireCore — map scanning: https://eschnitzler.github.io/EmpireCore/guides/map-scanning/
- EmpireCore — map enums: https://raw.githubusercontent.com/eschnitzler/EmpireCore/master/src/empire_core/enums/map.py
- EmpireCore — source: https://github.com/eschnitzler/EmpireCore
