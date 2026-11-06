# Raport iteracji — Empirenew / fortece IT1 i PL1

**Data:** 2026-11-06, 08:19–08:30 UTC  
**Repozytorium:** `marwlo-ops/Empirenew`  
**Gałąź prac nad mostem:** `feat/custom-empire-api-bridge-secure-20261106`  
**PR:** #13 — draft, otwarty, nie scalony.

## 1. Mapa IT1 — ostatni potwierdzony snapshot

Ostatni rzeczywisty import na `main` pochodzi z `2026-11-06T07:29:05.608532Z` i został zapisany w commicie `35e23ca6ac20b6fd8f7a05600c12e9d3ad984249`.

| Kraina | Liczba |
|---|---:|
| Piaski | 671 |
| Lód | 779 |
| Ogień | 571 |
| **Razem** | **2021** |

Walidacja JSON:
- 2021 rekordów i 2021 unikalnych ID;
- 2021 unikalnych współrzędnych;
- 0 duplikatów i 0 błędnych współrzędnych;
- dokładnie siedem pól na rekord: `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`;
- 0 pól cooldownu, gotowości, ataku i gracza.

Plan Barony: 2021 cele, 199 sektorów 100×100, 1 990 000 potencjalnych pól. Importer nadal oznacza zgodność siatki IT1/PL1 jako potwierdzoną przez operatora, nie niezależnie zweryfikowaną na żywej mapie PL1.

**Publikacja tego snapshotu na main:** Pages run `42183722274` dla commitu `5511a5e472e8cb2320f5f0e3032103365e7aaab8` zakończył build, report-build-status i deploy sukcesem. Nie oznacza to publikacji zmian z draft PR #13.

Nie uruchomiono nowego importu IT1 w tej iteracji. Następny harmonogram importera: cron `17 */6 * * *`; ostatni potwierdzony snapshot pozostaje z 07:29 UTC.

## 2. Najnowszy live probe PL1 — run 42188067183

Workflow zakończył się SUCCESS. Testy offline:
- Python probe: 13/13 PASS;
- Node Barony core: 47/47 PASS;
- walidacja katalogu IT1: PASS;
- test mobilnego interfejsu: PASS (viewport, 44 px cele dotykowe, focus states, etykiety źródeł i historii lokalnej);
- metadane przypiętego klienta E4K: PASS.

Wyniki sieciowe z 08:29–08:30 UTC:
- TCP do `e4k-live-pl1-game.goodgamestudios.com:443`: połączenie przyjęte po 218 ms, `payload_sent=false`. To tylko handshake TCP, bez logowania i komend gry.
- GGE Tracker `/servers`: HTTP 200, 63 wpisy.
- Katalog: `E4K_PL1 enabled=true, fortress=false`; `E4K_PL1_BETA enabled=true, fortress=true`.
- `/dungeons`: produkcyjny `E4K_PL1` HTTP 400; Beta HTTP 200 i 976 rekordów; IT1 HTTP 200 i 2021 rekordów.
- Beta/IT1: 976/976 zgodnych współrzędnych (Piaski 312, Lód 409, Ogień 255). To nie dowodzi, że Beta jest produkcyjnym PL1.
- Pięć historii graczy Beta: 6096 rekordów — wyłącznie Beta.
- Trzy próbki historii produkcyjnego PL1: `Player not found` / `Invalid player ID`, 0 rekordów.
- Sufiks zoneId 259: 3/3 próby HTTP 400.
- Publiczny most: HTTP 200, ale `target_connected=false`; GAA/FNM/GAM przez most zostały pominięte.

Wynik: nie uzyskano danych ataków z produkcyjnego PL1. Nie zapisano żadnego zdarzenia ataku i nie przypisano żadnego atakującego ani czasu ataku.

## 3. Zmiany bezpieczeństwa w draft PR #13

W `scripts/scan_npc_map.py` usunięto ryzyko ujawnienia danych graczy w publicznych logach/artefaktach CI:
- `content_preview` zastąpiono strukturalnym `content_summary` (typ JSON, liczba elementów, nazwy kluczy, liczba obiektów ze współrzędnymi, maksymalnie 5 próbek X/Y);
- ekstrakcja NPC używa wyłącznie pól typu/kategorii; nie kopiuje `name`, `owner`, ID graczy ani surowego obiektu;
- snapshot diagnostyczny nie ma pola `raw`;
- body błędów HTTP jest redagowane, a transport loguje tylko typ wyjątku;
- token nadal jest wysyłany wyłącznie w nagłówku Bearer, nie w URL.

Dodano dwa testy regresyjne do `tests/test_scan_npc_map_auth.py`: redakcja danych gracza w summary oraz brak nazw/ID/raw w wyekstrahowanym rekordzie NPC.

Końcowy run `42187981613` zakończył się SUCCESS:
- Node middleware/queue: 9/9 PASS;
- Python auth/routing/redaction: 6/6 PASS;
- patch zastosował się do przypiętego upstream `dc2e8c459a87d13a30d423b03bbbd8774f7f7b3d`;
- `node --check app.js` i middleware: PASS;
- job live w PR celowo SKIPPED.

Podczas tworzenia testów wystąpiły i zostały naprawione trzy błędy:
- `42187807293`: literalne `\\n` w imporcie testu;
- `42187866665`: literalne `\\n` w asercji;
- `42187922701`: test oczekiwał etykiety bez końcowych spacji; normalizację poprawiono, aby pomijała puste pola typu.
Końcowy run po tych poprawkach przeszedł.

Dokumentacja szczegółowa jest w `research/fortece-barona-status.md`, sekcja 46.

## 4. Stan wdrożenia i zakres

- PR #13 pozostaje draft i nie jest scalony.
- Nie utworzono forka upstream ani usługi Render.
- Nie ustawiono sekretów ani nie wykonano autoryzowanego logowania do gry.
- Kod mostu nie jest wdrożony i nie ma potwierdzonego GAA/FNM na produkcyjnym PL1.
- Nie zmieniono zakładek Mapa, Szpiegowanie ani Dodatkowe; nie zmieniono `barony.html` ani `mapa-rb.html`.

## 5. Blokada i następny krok

Do odblokowania historii ataków potrzebna jest autoryzowana sesja na produkcyjnym E4K PL1 albo kontrolowane wdrożenie własnego, zabezpieczonego mostu z osobnym kontem gry. Konto Beta nie może potwierdzać historii produkcyjnego PL1.

Następny test: potwierdzić `hgh`, GAA i GAM/FNM na żywej sesji, a następnie skorelować rzeczywisty ruch GAM z raportem NPC BLS/BLM. Dopiero po niezależnym potwierdzeniu można zapisywać atakującego i czas/zakres czasu. `attack_time_utc` pozostaje nieustalone.
