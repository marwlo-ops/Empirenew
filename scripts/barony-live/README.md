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

Po lokalnym, autoryzowanym połączeniu z produkcyjnym PL1 można opcjonalnie obserwować aktualizacje ruchów `GAM` wypychane przez serwer:

```sh
node scripts/barony-live/probe.mjs --movements
```

To jest wyłącznie pasywny odczyt ruchów widocznych dla zalogowanego konta. Probe nie wysyła komendy `GAM`: w przypiętym `ggejs` potwierdzono parser odpowiedzi i `MovementManager`, ale nie udokumentowano metody żądania snapshotu. Ekstraktor przyjmuje tylko ruch typu 11, kierunek wychodzący, cel typu 11, zgodny KID i właściciela NPC oraz dodatni ID właściciela źródła. Wynik zawiera ID gracza, dokładne X/Y celu i szacowany czas wyjścia/przybycia wyliczony przez `ggejs` z lokalnego zegara. `attack_time_utc` pozostaje `null`; ruch w drodze nie dowodzi zakończenia bitwy i nie obejmuje całego serwera. Dane ruchów są wypisywane tylko w wyniku lokalnego uruchomienia i nie są dopisywane do pliku stanu ani repozytorium.

Jeśli w oknie obserwacji 3 sekund nie nadejdzie aktualizacja `GAM`, wynik ma status `no_server_push_observed`; nie oznacza to, że serwer nie ma aktywnych ruchów. Okno obserwacji można zmienić przez `--movement-wait-ms 1000..10000`. Nie uruchamiaj tego w GitHub Actions; poświadczenia są przeznaczone wyłącznie do lokalnej sesji operatora.

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

Zmiana `defeater_player_id` albo przejście cooldownu z nieaktywnego na aktywny generuje **kandydacki sygnał dla konkretnej fortecy** z przedziałem między próbkami. Nie jest to dokładny czas ataku i nie jest zapisywane jako potwierdzona historia. Pierwsza próbka nie generuje zdarzenia historycznego. Brak cooldownu pozostaje stanem „nieznany”, a nie „brak cooldownu”.

GGE Tracker używa typu 11 oraz pola gracza z tego samego rekordu, ale jego publiczne `attacked_at` nie jest potwierdzonym timestampem serwera gry: scraper nie przekazuje pola `attacked_at` przy zapisie historii. Dla produkcyjnego PL1 nie mamy jeszcze działającego live odczytu, dlatego nie wyliczamy czasu ataku z 24-godzinnego założenia ani z cooldownu IT1/Beta.

Brak wiersza, błąd zapytania lub niezgodny typ/właściciel nie tworzy zdarzenia. Katalog IT1 służy wyłącznie do wyboru współrzędnych; cooldown i historia IT1/Beta nie są używane.
