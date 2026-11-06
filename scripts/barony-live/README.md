# Lokalny odczyt mapy fortec E4K PL1

Narzędzie jest **read-only**. Korzysta z klienta E4K `ggejs` i danych serwerów `e4k-data`; nie wysyła ataków ani szpiegowania. Przed importem klienta uruchamia wąski helper zgodności, który omija wyłącznie brakujący, nieużywany przez `ggejs` eksport `networkPreClient`.

## Dlaczego ten klient

- Dane `e4k-data` wskazują produkcyjny PL1 jako `EmpirefourkingdomsExGG_3`, host `e4k-live-pl1-game.goodgamestudios.com`, instancję 3, `zoneId=259`, `generic_country_PL`.
- `ggejs` wybiera transport TCP dla stref zaczynających się od `EmpirefourkingdomsExGG`.
- Katalog GGE Tracker `/dungeons` powstaje z rekordów mapy o `areaType=11`. Parser `ggejs` mapuje je na `BossDungeonMapobject`: `data[5]` to pozostały cooldown, `data[6]` to `defeaterPlayerId`, a `data[7]` to KID. Właściciele NPC dla KID 1/2/3 to odpowiednio -230/-231/-232.
- **Nie myl tego z typem 2 (`DungeonMapobject`)**: tam `data[4]` to licznik zwycięstw/postępu, `data[5]` cooldown, a `data[6]` KID. Typ 2 nie zawiera `defeaterPlayerId` i nie jest typem używanym przez katalog GGE Tracker fortec.

## Uruchomienie

W katalogu repozytorium:

```sh
npm install --prefix scripts/barony-live --ignore-scripts --no-audit --no-fund
node scripts/barony-live/probe.mjs --plan
```

Domyślny plan wybiera po 3 próbki w każdej krainie i nie łączy się z grą.

Do lokalnego testu live ustaw zmienne środowiskowe `E4K_USERNAME` i `E4K_PASSWORD` w swojej sesji terminala, a następnie uruchom:

```sh
node scripts/barony-live/probe.mjs
```

Nie przekazuj loginu/hasła jako argumentów, nie zapisuj ich w repozytorium, GitHub Actions, GitHub Secrets ani w czacie. Skrypt odmawia połączenia z inną strefą/hostem niż produkcyjny PL1.

Domyślnie odpytuje maksymalnie 3 punkty na krainę. Każdy odczyt sektora obejmuje 100×100 pól; przerwa między zapytaniami wynosi co najmniej 1000 ms. Według dokumentacji `ggejs` odczyt krainy jest dozwolony tylko wtedy, gdy konto ma w niej zamek; błąd takiego odczytu nie oznacza braku fortecy.

## Ruchy atakujące NPC (opcjonalnie)

Po lokalnym, autoryzowanym połączeniu z produkcyjnym PL1 można pobrać ruchy widoczne dla zalogowanego konta:

```sh
node scripts/barony-live/probe.mjs --movements
```

Probe wysyła **read-only** komendę `GAM` z pustym payloadem (`client.socketManager.sendCommand('gam', {})`). To nie jest już wyłącznie nasłuch pasywny. Niezależne repozytorium klienta `pygge` opisuje `Movements.get_movements()` jako pobranie ruchów gracza i wykonuje `send_json_command("gam", {})`, a następnie zbiera wszystkie odpowiedzi `gam` (`count=-1`), scala je i deduplikuje po `MID`. Zobacz [pygge movements.py](https://github.com/danadum/pygge/blob/f0ed456bd7b522f3f33b4f14fbb4856aa54ced64/pygge/map/movements.py) oraz [BaseGgeSocket](https://github.com/danadum/pygge/blob/f0ed456bd7b522f3f33b4f14fbb4856aa54ced64/pygge/base_gge_socket.py).

W przypiętym `ggejs` odpowiedź `gam` jest parsowana przez `commands/gam.js` i trafia do `MovementManager`; probe rozpoznaje wyłącznie batch wywołany przez ten handler, odrzucając aktualizacje CRA/CRM/CSM. Zbiera wiele batchy aż do 250 ms ciszy, z ograniczonym czasem oczekiwania. Jeżeli żądanie nie zostanie wysłane albo serwer nie odpowie, wynik wyraźnie to rozróżnia; brak odpowiedzi nie oznacza braku ruchów.

Ekstraktor przyjmuje tylko ruch typu 11, kierunek wychodzący, cel typu 11, zgodny KID i właściciela NPC oraz dodatni ID właściciela źródła. Wynik zawiera ID gracza, dokładne X/Y celu i szacowany czas wyjścia/przybycia. `PT` i `TT` są interpretowane względem lokalnego czasu próbki, więc `movement_departure_estimate_utc` nadal **nie jest dokładnym serwerowym czasem ataku**. Ruch w drodze nie dowodzi, że bitwa się zakończyła.

GAM zwraca ruchy dostępne dla bieżącej autoryzowanej sesji/konta; nie potwierdzono globalnej kompletności wszystkich ruchów PL1. Aktualizacja GAM zauważona przed wysłaniem jawnego żądania jest raportowana osobno jako `movement_pre_request_evidence` i nie jest wliczana do `movement_evidence`, `movement_count` ani statusu migawki z tego żądania. Dzięki temu wcześniejszy push nie może wyglądać jak odpowiedź na późniejsze żądanie. Dane ruchów są wypisywane wyłącznie w wyniku lokalnego uruchomienia i nie są dopisywane do pliku stanu ani repozytorium. Nie uruchamiaj tego w GitHub Actions; poświadczenia są przeznaczone wyłącznie do lokalnej sesji operatora.

## Raporty bitew NPC z własnej skrzynki (opcjonalnie)

Aby odczytać raporty NPC dostępne na zalogowanym koncie:

```sh
node scripts/barony-live/probe.mjs --reports
```

Po logowaniu `ggejs` pobiera skrzynkę przez `SNE`. Probe wybiera wyłącznie raporty typu battle log, area type 11 i subtype NPC attack 2, a następnie pobiera ich szczegóły przez read-only `BLS/BLM/BLD`. Ekstraktor wymaga zgodności KID/właściciela, dokładnych współrzędnych mapobject oraz dodatniego ID atakującego i zgodnego obrońcy NPC. Maksymalnie 10 raportów jest sprawdzanych domyślnie; limit można zmienić przez `--report-limit 1..25`.

Wynik zawiera lokalizację, ID atakującego, nazwę gracza jeśli `ownerInfo` ją udostępnia (w przeciwnym razie pozostaje sam ID), wynik bitwy i `report_delivery_time_estimate_utc`. Probe wybiera najnowsze raporty według czasu dostarczenia wiadomości. To **czas dostarczenia/odczytu wiadomości wyliczony z wieku skrzynki**, nie dokładny czas rozpoczęcia ataku; `attack_time_utc` pozostaje `null`. Raport dotyczy wyłącznie wiadomości dostępnych temu kontu, nie wszystkich graczy PL1. Probe niczego nie usuwa, nie oznacza jako przeczytane, nie przekazuje dalej i nie zapisuje raportów do pliku stanu ani repozytorium.

Jeżeli odpowiedź skrzynki nie nadejdzie w ciągu 3 sekund, status będzie `mailbox_update_not_observed`; okno można zmienić przez `--report-wait-ms 1000..10000`.

## Pełny plan

```sh
node scripts/barony-live/probe.mjs --plan --all
```

Aktualny katalog IT1 ma 2021 punktów i 199 unikalnych sektorów 100×100 (szacunkowo 1 990 000 pól do odczytu). To tylko plan, nie test live. Nie uruchamiaj `--all` przed pozytywnym testem małej próbki i potwierdzeniem limitów PL1.

## Dane i ograniczenia

Pierwsze uruchomienie zapisuje wyłącznie ostatnie surowe, zweryfikowane obserwacje w prywatnym pliku `~/.cache/empirenew/barony-pl1-boss-dungeon-state.json` (zmiana przez `BARONY_STATE_FILE`). Plik nie trafia do repozytorium ani GitHub Pages. Nowy plik stanu jest celowo oddzielony od wcześniejszego stanu typu 2. Helper `prepare-e4k-data.mjs` patchuje wyłącznie opcjonalny eksport `networkPreClient`, jeśli pakiet odwołuje się do nieobecnego `network/77.json`; nie zmienia `network.json` ani danych gry.

Każda próbka sprawdza dokładnie `kid/x/y`, `areaType=11` i oczekiwanego właściciela NPC. Z poprawnego wiersza zapisuje:
- `defeater_player_id` — identyfikator gracza z pola `BossDungeonMapobject.defeaterPlayerId`;
- `dungeon_level`;
- pozostały cooldown i wyliczony czas końca cooldownu;
- czas pobrania próbki.

Zmiana `defeater_player_id` albo przejście cooldownu z nieaktywnego na aktywny generuje **kandydacki sygnał dla konkretnej fortecy** z przedziałem między próbkami. Porównanie jest wykonywane tylko wtedy, gdy obie obserwacje zawierają dokładnie jeden wiersz na tych samych KID/X/Y, ten sam identyfikator katalogowy, typ 11 i oczekiwanego właściciela NPC; wiele wierszy na jednej współrzędnej jest oznaczane jako niejednoznaczne. Przedział próbek musi wynosić maksymalnie 2 godziny — starsza próbka nie tworzy kandydata. Nie jest to dokładny czas ataku i nie jest zapisywane jako potwierdzona historia. Pierwsza próbka nie generuje zdarzenia historycznego. Brak cooldownu pozostaje stanem „nieznany”, a nie „brak cooldownu”.

GGE Tracker używa typu 11 oraz pola gracza z tego samego rekordu, ale jego publiczne `attacked_at` nie jest potwierdzonym timestampem serwera gry: scraper nie przekazuje pola `attacked_at` przy zapisie historii. Dla produkcyjnego PL1 nie mamy jeszcze działającego live odczytu, dlatego nie wyliczamy czasu ataku z 24-godzinnego założenia ani z cooldownu IT1/Beta.

Brak wiersza, błąd zapytania lub niezgodny typ/właściciel nie tworzy zdarzenia. Katalog IT1 służy wyłącznie do wyboru współrzędnych; cooldown i historia IT1/Beta nie są używane.


## Dodatkowy audyt źródeł ruchów i timestampów — 2026-11-06

- Publiczny endpoint GGE Tracker GET /server/movements opisuje historię ruchów zamków (relokacje, nowe posterunki i podboje), a nie marsze armii. Implementacja API opisuje movementType jako: 1 = add, 2 = remove, 3 = move. Nie używamy tego endpointu jako źródła ataków na fortece NPC.
- GET /dungeons/player/{playerId} odczytuje dungeons_history.attacked_at. Natomiast lista GET /dungeons zwraca last_attack z kolumny dungeons.last_attack_at. To różne pola i ścieżki danych.
- Publiczny scraper GGE Tracker przetwarza obiekty typu 11, odczytuje pozostały cooldown z dungeon[5] i ID pokonującego z dungeon[6], a global_available_at wylicza jako czas odczytu plus pozostały cooldown. W widocznym kodzie persistDungeonUpdates() wstawia do dungeons_history tylko kid, position_x, position_y, player_id — bez jawnego attacked_at. Schemat bazy, domyślna wartość kolumny lub trigger nie są dostępne w tym źródle.
- Dlatego eksperyment global_available_at - last_attack ≈ 24 h nie dowodzi pochodzenia ani dokładności czasu ataku. Wcześniejsza hipoteza o timestampie wyprowadzanym z 24-godzinnego cooldownu zostaje oznaczona jako nierozstrzygnięta; bez schematu/triggera lub niezależnego zdarzenia referencyjnego nie używamy tego czasu jako attack_time_utc.
- Niezależny kod ggejs potwierdza: MovementType.NPCAttack = 11, WorldMapArea.BossDungeon = 11; BasicMovement mapuje D=0 jako ruch wychodzący (właściciel w sourceArea) i D=1 jako ruch powrotny (właściciel w targetArea). PT/TT są przeliczane względem lokalnego czasu parsowania, więc wyjście/przybycie pozostają estymatami, nie serwerowym timestampem.
- BossDungeonMapobject mapuje data[5] na pozostały cooldown, data[6] na defeaterPlayerId, a data[7] na KID. To wspiera walidację pól mapy, ale samo defeaterPlayerId nie daje dokładnego czasu wysłania armii.
- Źródła do audytu:
  - https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-server.ts
  - https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts
  - https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts
  - https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/movements/BasicMovement.js
  - https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/mapobjects/BossDungeonMapobject.js

Wniosek operacyjny: dla Barony właściwym źródłem ruchu pozostaje odpowiedź GAM z autoryzowanej sesji PL1; /server/movements jest wykluczony. Ruch GAM może potwierdzić cel i ID gracza, ale czas wyjścia/przybycia jest estymowany. Raport NPC skorelowany po MID/LID potwierdza cel i atakującego w zakresie skrzynki danego konta. `BLS.PS` i `BLM.PS` są przechowywane wyłącznie jako niezweryfikowane wartości diagnostyczne: przypięty kod ggejs nie definiuje ich semantyki, więc nie obliczamy z nich czasu bitwy. `attack_time_utc` i `battle_time_estimate_utc` pozostają null.
