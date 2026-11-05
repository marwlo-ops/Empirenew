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

## Wykrywanie ataków — korekta parsera i ustalenia protokołu (2026-11-05)

### 1. Katalog fortec GGE Tracker odpowiada obiektom typu 11

Wewnętrzny scraper GGE Tracker filtruje odpowiedź `gaa` warunkiem `dungeon[0] == '11'` zarówno przy odkrywaniu lokalizacji, jak i przy aktualizacji cooldownów. Dla tego rekordu używa:
- `data[1]`, `data[2]` — X/Y;
- `data[5]` — pozostały cooldown;
- `data[6]` — `player_id`.

Parser `ggejs` mapuje `areaType=11` na `BossDungeonMapobject`, gdzie `defeaterPlayerId=data[6]`, `kingdomId=data[7]`, a `attackCooldownEnd` jest wyliczany z `data[5]`. Właściciel obiektu jest pobierany jako `getKingdomBossDungeonOwnerByKingdomId(kid)`, co daje -230/-231/-232 dla KID 1/2/3.

**Korekta poprzedniej implementacji:** katalog 2021 współrzędnych z GGE Tracker nie powinien być sprawdzany jako `areaType=2` z właścicielem -220/-221/-222. To inny obiekt. Probe został przełączony na `areaType=11` i pole `defeaterPlayerId`.

Źródła:
- `ggejs` — parser typów mapy: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/utils/MapObjectParser.js
- `ggejs` — BossDungeonMapobject: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/mapobjects/BossDungeonMapobject.js
- `ggejs` — zwykły DungeonMapobject, odrębny typ 2: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/mapobjects/DungeonMapobject.js
- `ggejs` — identyfikatory właścicieli NPC: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/utils/WorldMapOwnerInfoData.js

### 2. Co można, a czego nie można uznać za dowód

`BossDungeonMapobject.defeaterPlayerId` jest polem przypisanym do konkretnego obiektu mapy, a GGE Tracker zapisuje tę wartość jako `player_id` dla tego samego `kid/x/y`. To znacznie silniejszy sygnał niż łup, honor lub odległość zamku. Po uzyskaniu prawidłowego wiersza z produkcyjnego PL1 możemy zapisać dokładny cel i ID gracza wskazane przez mapę.

Sam wiersz nie zawiera jednak dokładnego czasu ataku. Zmiana ID gracza lub rozpoczęcie cooldownu pomiędzy dwiema próbkami daje najwyżej przedział czasu między próbkami. Nie wolno zapisywać go jako dokładnego `attacked_at` ani nazywać potwierdzonym zdarzeniem PL1, dopóki nie przejdzie kontrolowanego testu live.

Dla porównania, typ 2 `DungeonMapobject` ma `attackCount=data[4]`, używany przez klienta jako licznik zwycięstw/postępu poziomu, `attackCooldownEnd` z `data[5]` i KID z `data[6]`. Nie zawiera pola gracza, który pokonał obiekt. Nie używamy go do identyfikacji atakującego fortecy z katalogu GGE Tracker.

### 3. Ograniczenie publicznego API GGE Tracker

Wewnętrzny scraper:
- dodaje do katalogu tylko rekordy `areaType=11`;
- przy aktualizacji cooldownu używa `data[5]` i `data[6]`;
- zapisuje historię w tabeli `dungeons_history` przez `INSERT (kid, position_x, position_y, player_id)`, bez przekazania pola `attacked_at`.

Publiczny endpoint `/dungeons/player/{playerId}` odczytuje potem `kid/x/y/attacked_at`. Ponieważ scraper nie przekazuje `attacked_at` w INSERT, nie traktujemy tego pola jako dokładnego serwerowego czasu ataku; jest to znacznik po stronie bazy/scrapera i jego dokładność wymaga osobnej walidacji.

Źródła:
- GGE Tracker — discovery i mapowanie `areaType=11`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts
- GGE Tracker — endpoint historii gracza: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts
- GGE Tracker — mapowanie odpowiedzi `gaa`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/empire-api/src/data/commands.json

### 4. Wyniki serwerów i granica PL1/Beta

- `E4K_PL1` pozostaje wyłączony dla publicznego katalogu fortec GGE Tracker (`fortress=false`); endpoint `/dungeons` odrzuca produkcyjny PL1.
- `E4K_PL1_BETA` udostępnia osobny katalog i historię. Nie wolno używać tych danych jako historii produkcyjnego PL1.
- Wszystkie 976 współrzędnych z poprzedniego testu Beta pokrywały się z katalogiem IT1, a użytkownik potwierdził zgodność siatki IT1 i PL1. To potwierdza wybór współrzędnych, nie cooldown ani historię ataków.
- Nie używamy żadnego cooldownu IT1 ani Beta do wyliczania czasu ataku PL1.

### 4.1. Test identyfikatora gracza z końcówką zoneId (2026-11-05)

Endpoint historii `/dungeons/player/{playerId}` nie wybiera serwera z nagłówka `gge-server`. Waliduje numeryczny identyfikator, bierze jego ostatnie trzy cyfry jako kod serwera i przez `getPgSqlPoolFromRequestId` szuka aktywnego wpisu z takim `code`.

Wykonałem dodatkowy test, bo `member_id` z `location-snapshots.json` jest surowym identyfikatorem liczbowym (w próbce 109 członków: 4–7 cyfr), bez widocznej końcówki serwera:
- wziąłem 3 identyfikatory z migawki PL1;
- pobrałem `zoneId=259` z przypiętego `e4k-data` dla produkcyjnego `EmpirefourkingdomsExGG_3`;
- sprawdziłem `/dungeons/player/{member_id}259?lastDays=365`, bez nagłówka serwera;
- wynik: **3/3 HTTP 400 — Invalid player ID**, 0 rekordów historii.

Wniosek: `zoneId=259` nie jest potwierdzonym kodem serwera GGE Tracker. Nie dopisujemy go do ID w aplikacji. Do dalszego testu brakuje rzeczywistego trzycyfrowego `code` z aktywnej konfiguracji serwerów GGE Tracker albo niezależnego, potwierdzonego identyfikatora PL1 z ich bazy.

Źródła:
- GGE Tracker — `verifyIdWithCountryCode` i pobieranie ostatnich trzech cyfr: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/helper/api-helper.ts
- GGE Tracker — wybór puli bazy przez `code`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/managers/api.manager.ts
- GGE Tracker — zapytanie historii po ID: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts

### 5. Aktualny stan implementacji i następny test

Probe `scripts/barony-live/probe.mjs` sprawdza teraz `areaType=11`, właściciela -230/-231/-232, `defeaterPlayerId` oraz cooldown dokładnie na współrzędnych katalogu. Surowe obserwacje trafiają do prywatnego pliku stanu; kandydackie sygnały pozostają tylko w wyniku uruchomienia.

Następny wymagany test to odczyt kilku próbek na autoryzowanej sesji produkcyjnego PL1 i porównanie:
1. surowego wiersza `gaa` typu 11;
2. `kid/x/y` oraz `defeaterPlayerId`;
3. przejścia cooldownu pomiędzy próbkami;
4. raportu NPC z konta, które otrzymało raport.

Dopiero po potwierdzeniu długości cooldownu i zachowania pola `defeaterPlayerId` na PL1 będzie można wyznaczać przedział ataku. Dokładny czas serwerowy nadal wymaga źródła, które go rzeczywiście udostępnia.

### 4.2. Źródło właściwego kodu serwera i nowy test routingu ID (2026-11-05)

Niezależny projekt GGE Assistant mapuje e4k_pl1 na strefę EmpirefourkingdomsExGG_3. To potwierdza wartość używaną przez przypięty e4k-data i scripts/barony-live/probe-core.mjs. Wcześniejszy scripts/probe-baron-pl1.js używał starej wartości EmpirefourkingdomsExGG2_3 dla statusu mostu, więc mógł sprawdzać niewłaściwy klucz. Probe korzysta teraz ze wspólnej stałej DEFAULT_PL1_ZONE i nadal porównuje starą wartość jako osobny wariant diagnostyczny.

Źródła:
- GGE Assistant — mapa serwerów E4K: https://github.com/nathael-aa/gge-assistant-bot/blob/91cb8a16d2175ddfbdd435c9b5eb87d178e0cc13/utils.py
- GGE Tracker — verifyIdWithCountryCode, getCountryCode, removeCountryCode i addCountryCode: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/helper/api-helper.ts
- GGE Tracker — routing historii po kodzie z ostatnich trzech cyfr ID: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/managers/api.manager.ts
- GGE Tracker — profil gracza zawiera server_code i player.player_id: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-profiles.ts

Nowy test production-pl1-player-history-with-catalog-code-suffix:
1. Pobiera XML /servers/catalog i odczytuje <code> dla E4K_PL1 (nie używa zoneId z e4k-data).
2. Dopisuje ten kod do trzech member_id z migawki Szpiegowania.
3. Sprawdza /players/{id}/profile?include=none; dopiero zgodność server_code, pełnego player_id i nazwy z migawką potwierdza tożsamość.
4. Sprawdza /dungeons/player/{id} i porównuje kid/x/y z katalogiem fortec. Rekordy z niepotwierdzoną tożsamością nie są zaliczane do PL1.

Poprzedni test z sufiksem zoneId=259 pozostaje w logu jako nieudana hipoteza (3/3 HTTP 400). Nowy test ma odrębne źródło kodu i nie zakłada, że zoneId jest kodem GGE Tracker. W chwili dodania testu jego wynik live oczekuje na wykonanie workflow; nie zapisujemy żadnych wyników przed otrzymaniem odpowiedzi.

Ograniczenie czasu: scraper GGE Tracker w collectDungeonCooldowns wybiera rekordy typu 11 z dodatnim pozostałym cooldownem, a następnie wykonuje INSERT INTO dungeons_history (kid, position_x, position_y, player_id) bez jawnego pola attacked_at. API odczytuje później DH.attacked_at. Dopóki schemat i domyślna wartość kolumny nie potwierdzą pochodzenia czasu, nie traktujemy attacked_at jako dokładnego czasu zdarzenia gry. Kod scrapera może również zapisywać obserwacje tego samego aktywnego cooldownu w kolejnych przebiegach; nie liczymy automatycznie każdego wiersza jako nowego ataku.

Źródło: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts
