# Empirenew — raport iteracji 11: fortecy IT1 / historia PL1

**Czas audytu:** 2026-11-07 00:56 Europe/Warsaw (2026-11-06 23:56 UTC)  
**Repozytorium:** `marwlo-ops/Empirenew`  
**Zakres:** katalog IT1, moduł Barony, źródła historii ataków E4K PL1. Bez zmian w zakładkach Mapa, Szpiegowanie i Dodatkowe.

## 1. Stan repozytorium i katalog IT1

Aktualny `main` podczas audytu: `ab3bff0ff97b182fd74c36c38fae5b00047ce202`.

Bezpośrednio pobrany `data/baron-fortresses.json`:

- `captured_at=2026-11-06T19:04:51.840217Z`;
- `server_source=IT1`, `complete=true`, `pages_read=1`, `total_count=2021`;
- Piaski: 671, Lód: 779, Ogień: 571;
- 2021 unikalnych ID i 2021 unikalnych par KID/X/Y;
- każdy rekord ma dokładnie 7 pól: `id`, `kid`, `kingdom`, `source_server`, `type`, `x`, `y`;
- brak pól cooldownu, gotowości, ataku, gracza, właściciela i historii.

Ostatni pełny import: workflow `42276430705`, zakończony sukcesem 2026-11-06 19:04:42 UTC. Log potwierdza: `Imported 2021 map-only IT1 records across 1 page(s)`; walidator i plan skanu przeszły (2021 celów, 199 sektorów 100×100).

Nowsza sonda API w workflow `42314589168` (2026-11-06 23:51:26–23:51:47 UTC) potwierdziła:
- `GET /dungeons` dla IT1: HTTP 200, `total_items_count=2021`;
- `GET /dungeons/meta` dla IT1: HTTP 200, `last_scan_at=2026-11-06T23:51:41.734Z`.

To potwierdza świeżość źródła IT1, ale sonda pobrała próbkę, a nie pełny katalog. Plik w repozytorium nadal ma snapshot z 19:04 UTC. Harmonogram pełnego importu jest ustawiony na co 6 godzin (`17 */6 * * *)); kolejny termin przypada na 2026-11-07 00:17 UTC. Nie deklaruję nowego pełnego importu przed potwierdzeniem tego workflow.

## 2. Produkcyjny E4K PL1 — wyniki live

Workflow `42314589168` wykonał read-only testy na rzeczywistym API:

| Źródło | Wynik |
|---|---|
| GGE Tracker `E4K_PL1` w katalogu serwerów | `enabled=true`, `fortress=false` |
| GGE Tracker `E4K_PL1_BETA` | `enabled=true`, `fortress=true` |
| `/dungeons` dla produkcyjnego `E4K_PL1` | HTTP 400, `Invalid server` |
| `/dungeons` dla `E4K_PL1_BETA` | HTTP 200, 976 rekordów |
| `/dungeons` dla IT1 | HTTP 200, 2021 rekordów |
| Beta ↔ IT1 | 976/976 współrzędnych zgodnych; nie dowodzi to historii produkcyjnego PL1 |

Historia pięciu graczy Beta zwróciła 1845 rekordów, wszystkie dopasowane do punktów Beta. To wyłącznie test Beta — żadnego z tych rekordów nie przeniesiono do PL1. Produkcyjny kod serwera GGE Tracker nadal jest pusty (`code=null`), więc test historii gracza został bezpiecznie pominięty.

Most PL1:
- `/status`: HTTP 200, sesja mostu zgłoszona jako połączona;
- GAA: pominięte, ponieważ most nie ma potwierdzonego mapowania odpowiedzi; komendy nie wysłano;
- GAM: HTTP 200, `return_code=0`, 0 ruchów i 0 potwierdzonych ataków na fortece w widocznej sesji.

GAM obejmuje wyłącznie ruchy widoczne dla tej sesji mostu, nie cały serwer. Wynik 0 nie dowodzi, że na PL1 nikt nie atakował.

## 3. Nowy audyt pochodzenia czasu `last_attack` w GGE Tracker

Sprawdziłem kod źródłowy upstream:
- `gge-tracker-internal-scraping/src/main.ts`;
- `gge-tracker-backend-api/src/api/routes/api-dungeons.ts`.

W `collectDungeonCooldowns()` scraper:
1. przyjmuje obiekty typu 11;
2. odczytuje `dungeon[5]` jako pozostały cooldown i `dungeon[6]` jako ID pokonującego;
3. wylicza `global_available_at = currentTime + remainingCooldown`.

W `persistDungeonUpdates()` scraper aktualizuje `dungeons.global_available_at`, a następnie wykonuje `INSERT INTO dungeons_history (kid, position_x, position_y, player_id)` — bez jawnego pola `attacked_at`.

Endpoint `/dungeons` odczytuje `D.last_attack_at` jako `last_attack` oraz `D.last_attacker_id` jako ID gracza. Endpoint `/dungeons/player/{playerId}` odczytuje `dungeons_history.attacked_at`. Publiczne źródła kodu nie zawierają schematu produkcyjnej bazy ani definicji domyślnej wartości/triggera dla `attacked_at`.

W ostatnim teście porównanie `global_available_at - last_attack` dla próbek IT1 i Beta dawało około 86 280–86 395 sekund (blisko 24 godzin). Teraz wiadomo, że scraper wylicza `global_available_at` z chwili odczytu i pozostałego cooldownu, a timestampu `attacked_at` nie podaje jawnie w insercie historii. Zbieżność z 24 godzinami **nie dowodzi**, że `last_attack` jest dokładnym czasem bitwy. Nie używamy go jako potwierdzonego `attack_time_utc`.

Wniosek: GGE Tracker może być źródłem współrzędnych IT1 i stanu cooldownu na obsługiwanych serwerach, ale nie mamy dowodu, że jego pole `last_attack` jest dokładnym serwerowym czasem ataku. Endpoint historii jest filtrowany po graczu, a nie globalny per lokalizacja.

## 4. Build, testy i mobilność

- Workflow `42314589168`: SUCCESS. Python: 13/13 testów sondy i 19/19 testów importera; Node: 60/60 testów rdzenia i 8/8 testów fallbacku; walidacja katalogu IT1 PASS; sonda API zakończona bez zapisu historii.
- Test UI `42314465480`: SUCCESS. Widok mobilny, breakpointy, cele dotykowe 44 px, focus, etykiety historii lokalnej i separacja dowodów — PASS.
- GitHub Pages `42314595374`: build i deploy — SUCCESS dla commitu `ab3bff0`.

To są testy CI i potwierdzenie deploymentu, nie ręczny test na fizycznym telefonie.

Dodatkowa obserwacja UI: `barony.html` zawiera osobny panel jawnie opisany `E4K_PL1_BETA`, który ładuje `data/fortress-radar-e4k-pl1-beta.json`. Tego pliku nie ma w aktualnym drzewie `main`; ostatni test workflow PR #39 zakończył się błędem, bo `BARONY_PLAYER_NAME` było puste. Panel nie jest dowodem danych produkcyjnego PL1 i nie został przeze mnie zmieniony.

## 5. Zmiany w tej iteracji

- Nie zmieniałem kodu aplikacji ani katalogu mapy, bo nie było nowego pełnego importu ani potwierdzonego źródła historii PL1.
- Dodaję wyłącznie ten raport diagnostyczny.
- Nie zapisano żadnych zdarzeń ataku; liczba nowych potwierdzonych ataków produkcyjnego PL1: **0**.
- `attack_time_utc` pozostaje nieustalony.
- Zakładki Mapa, Szpiegowanie i Dodatkowe pozostały nietknięte.

## 6. Blokady i następny krok

Blokady:
1. GGE Tracker odrzuca produkcyjny `E4K_PL1` dla `/dungeons` (HTTP 400, `fortress=false`).
2. Publiczny most nie dostarczył ruchów w bieżącej próbce; GAA nie jest bezpiecznie obsługiwane.
3. Brak globalnego, potwierdzonego feedu ataków NPC dla PL1.
4. Nie wykonano lokalnej autoryzowanej sesji operatora w tym uruchomieniu.

Następny krok:
- potwierdzić wynik kolejnego pełnego importu IT1 po harmonogramie 00:17 UTC i sprawdzić jego publikację;
- na autoryzowanej, lokalnej sesji produkcyjnego PL1 testować małe, read-only próbki mapy, GAM i własną skrzynkę raportów;
- rozdzielać czas próbki, przedział obserwacji i czas dostarczenia raportu; nie zamieniać ich w dokładny czas ataku bez potwierdzonego pola serwerowego.

Źródła upstream:
- https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts
- https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts
- https://docs.gge-tracker.com/
