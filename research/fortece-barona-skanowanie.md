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

## Status katalogu mapy — 2026-11-05

W repozytorium znajduje się katalog `data/baron-fortresses.json` z mapą pobraną z GGE Tracker IT1:
- Płonące Piaski: 671 lokalizacji,
- Wieczny Lód: 779 lokalizacji,
- Ogniste Szczyty: 571 lokalizacji,
- łącznie: 2021 rekordów; `complete: true`, bez traktowania tego pola jako potwierdzenia źródła PL1.

Użytkownik potwierdził, że siatka współrzędnych IT1 i produkcyjnego PL1 się pokrywa. Pochodzenie katalogu nadal oznaczamy jako IT1; dane są używane wyłącznie jako mapa celów, nie jako historia ataków.

## Wykrywanie ataków — ustalenia protokołu

### 1. Najbardziej obiecujący odczyt: GAA / mapa obiektu

Dokumentacja i modele EmpireCore pokazują, że odpowiedź na skan mapy `gaa` zawiera rekordy obiektów z polami zależnymi od typu obiektu. Dla desktopowego `MapItemType.DUNGEON = 2` parser odczytuje `attack_cooldown_seconds` z indeksu 5; indeks 6 jest tam kodem krainy, a nie identyfikatorem atakującego. Dla `BOSS_DUNGEON = 11` indeks 5 także przechowuje cooldown, a indeks 6 może być identyfikatorem gracza, który pokonał obiekt. Nie wolno przenosić indeksów między typami bez potwierdzenia rzeczywistej odpowiedzi E4K PL1.

Źródła:
- EmpireCore — modele obiektów mapy: https://github.com/eschnitzler/EmpireCore/blob/01800fa1033a4413b51f5dfe2c3e3d1a3fdcdca7/src/empire_core/map/models/items.py
- EmpireCore — skanowanie mapy: https://github.com/eschnitzler/EmpireCore/blob/01800fa1033a4413b51f5dfe2c3e3d1a3fdcdca7/src/empire_core/map/models/areas.py

### 2. Sprawdzony wzorzec scrapera GGE Tracker

Kod wewnętrznego scrapera GGE Tracker wykonuje zapytania `gaa` dla fragmentów mapy, odczytuje pozostały cooldown z rekordu obiektu i zapisuje historię dla współrzędnych `kid/x/y`. W implementacji dla obiektów typu `11` używa indeksu 5 jako pozostałego cooldownu i indeksu 6 jako `player_id`. Aktualizuje też `global_available_at` na podstawie czasu pobrania i pozostałych sekund cooldownu.

Ważne ograniczenie: pole `last_attack` w API GGE Tracker jest czasem zarejestrowania zdarzenia przez scraper, a nie dowiedzionym, serwerowym timestampem ataku. Dokładność zależy od częstotliwości odczytu. To jednak daje wiarygodny, celowy punkt odniesienia dla konkretnego obiektu, znacznie lepszy niż globalny wzrost łupu.

Źródła:
- GGE Tracker — pobieranie i aktualizacja cooldownów: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts
- GGE Tracker — worker aktualizacji dungeonów: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/dungeon-update.worker.ts
- GGE Tracker — mapowanie odpowiedzi `gaa` po `KID`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/empire-api/src/data/commands.json

### 3. Wyniki testów produkcyjnego PL1 i serwera Beta

Odczyty z GitHub Actions z 2026-11-05:
- `https://api.gge-tracker.com/api/v1/servers` zwrócił 63 identyfikatory i zawierał zarówno `E4K_PL1`, jak i `E4K_PL1_BETA`.
- `/servers/catalog` zwrócił wpis produkcyjnego `E4K_PL1` z nazwą „Empire Four Kingdoms - Poland 1” i flagą `fortress=false`; wpis `E4K_PL1_BETA` ma `fortress=true`.
- `/dungeons` odrzuca `E4K_PL1` komunikatem „Invalid server”; akceptuje `E4K_PL1_BETA`.
- Dla Beta API zwróciło 976 rekordów z polami `last_attack`, `player_id`, `global_available_at` i `effective_cooldown_until`. Wszystkie 976 współrzędnych z odpowiedzi Beta wystąpiły w katalogu IT1: Piaski 312/312, Lód 409/409, Ogień 255/255.
- Zbieżność współrzędnych Beta z IT1 potwierdza wspólną siatkę dla tych rekordów, ale nie dowodzi, że ataki Beta są atakami na produkcyjnym PL1. Danych Beta nie wolno zapisywać do historii produkcyjnego PL1.

### 4. Test mostu E4K PL1

Most `https://empire-api.fly.dev` wykazał wcześniej, że socket `EmpirefourkingdomsExGG2_3` bywał połączony. Gdy był połączony, próby odczytu `gaa`, `fnm` oraz `gam` kończyły się HTTP 400 „Invalid command or headers”. W późniejszym pomiarze socket był już rozłączony. Nie uzyskano żadnej odpowiedzi mapy PL1 ani rekordu ruchu, który można przypisać do współrzędnych fortec.

To nie dowodzi, że serwer nie udostępnia tych danych. Pokazuje, że obecny publiczny most nie ma działającego dopasowania odpowiedzi dla tych komend albo nie ma aktywnej sesji/obsługi danego żądania. GGE Tracker ma mapowanie odpowiedzi `gaa` wyłącznie po `KID`; w obecnym moście nie potwierdziliśmy takiego mapowania.

### 5. Reguły zapisu i dalszy plan

1. Nie zapisuj ataku na podstawie łupu, honoru, potęgi ani położenia zamku gracza.
2. Nie używaj danych Beta jako historii PL1.
3. Gdy uzyskamy prawidłową odpowiedź `gaa` z PL1, zapisz surowy rekord, `kid/x/y`, typ obiektu, cooldown, `sampled_at` i źródło. Zachowaj dowód surowego odczytu.
4. Po potwierdzeniu typu obiektu i całkowitego cooldownu 24 h wyliczaj `available_at = sampled_at + remaining_cooldown`. Czas ataku można szacować z cooldownu tylko po walidacji pełnej długości cooldownu; zapisuj przedział niepewności wynikający z interwału odczytu.
5. Dla zwykłego barona nie zakładaj, że rekord mapy zawiera identyfikator atakującego. Jeżeli potrzebny jest nick atakującego, wymagany będzie osobny dowód z ruchu lub raportu walki.
6. Następny wymagany element techniczny: most do produkcyjnego E4K PL1 z obsługą odpowiedzi `gaa` (dopasowanie co najmniej po `KID`) albo włączenie produkcyjnego `E4K_PL1` do scrapera GGE Tracker. Bez tego nie ma potwierdzonego źródła automatycznej historii PL1.

