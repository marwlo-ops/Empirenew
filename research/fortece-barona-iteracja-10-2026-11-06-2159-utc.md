# Fortecy IT1 / PL1 — raport iteracji 10

**Czas audytu:** 2026-11-06 21:59 UTC (22:59 Europe/Warsaw)  
**Repozytorium:** `marwlo-ops/Empirenew`  
**Zakres:** wyłącznie katalog i moduł Barony oraz diagnostyka PL1. Bez zmian w zakładkach Mapa, Szpiegowanie i Dodatkowe.

## 1. Stan repozytorium

- HEAD `main` na początku audytu: `4487cc93553e3a36edf7f16a335d17274d022a77` (2026-11-06 21:23:48 UTC).
- Ostatnia zmiana kodu mostu Barony: `5589ea733c87ae1ec96f4bed0e4cfefe6afb1463`.
- Późniejsze commity dotyczyły dokumentacji i snapshotów pozostałych trackerów; nie zmieniały `barony.html`, `scripts/barony-live/**` ani `data/baron-fortresses.json`.
- W tej iteracji nie wprowadzono zmian kodu aplikacji. Zapisano ten raport, ponieważ nie pojawił się nowy, bezpiecznie potwierdzony wynik wymagający zmiany logiki.

## 2. Katalog IT1 — walidacja aktualnego pliku w repozytorium

Plik: `data/baron-fortresses.json`  
`captured_at=2026-11-06T19:04:51.840217Z`

| Kraina | Rekordy |
|---|---:|
| Piaski (`sands`) | 671 |
| Lód (`ice`) | 779 |
| Ogień (`fire`) | 571 |
| **Razem** | **2021** |

Walidacja bezpośrednio pobranego pliku:
- `complete=true`, `pages_read=1`, `total_count=2021`;
- 2021 unikalnych identyfikatorów i 2021 unikalnych par KID/X/Y;
- każdy rekord ma dokładnie 7 pól: `id`, `kid`, `kingdom`, `source_server`, `type`, `x`, `y`;
- wszystkie rekordy wskazują źródło `IT1`;
- 0 pól cooldownu, gotowości, ataku, gracza, właściciela lub historii.

**Granica znaczenia:** jest to kompletny katalog współrzędnych pobrany z IT1. Pole `target_server=E4K_PL1` opisuje docelową siatkę zgodnie z potwierdzeniem operatora; importer nie potwierdza aktualnej obecności każdej fortecy na produkcyjnym PL1.

## 3. Najnowszy dostępny test publicznego API

Zweryfikowałem logi workflow `42285478811` (job `128125054511`), zakończonego sukcesem 2026-11-06 około 20:06 UTC.

- `/servers/catalog`: HTTP 200. `E4K_PL1` ma `enabled=true`, ale `fortress=false`; `E4K_PL1_BETA` ma `fortress=true`.
- `/dungeons` dla `E4K_PL1`: HTTP 400, `Invalid server`.
- `/dungeons` dla `E4K_PL1_BETA`: HTTP 200, 976 rekordów.
- `/dungeons` dla `IT1`: HTTP 200, 2021 rekordów; metadane wskazywały `last_scan_at=2026-11-06T20:05:39.568Z`.
- Historia 5 próbkowanych graczy Beta: 5/5 niepustych, 3182 rekordy. To wyłącznie diagnostyka Beta; nie skopiowano jej do PL1.
- Test historii produkcyjnego PL1 został pominięty, ponieważ nie znaleziono zweryfikowanego trzycyfrowego kodu serwera GGE Tracker. `zoneId=259` z `e4k-data` nie jest zamiennikiem tego kodu.
- Publiczny most: `/status` HTTP 200, socket PL1 zgłoszony jako połączony; GAA pominięto z powodu braku bezpiecznego mapowania odpowiedzi; GAM HTTP 200, `return_code=0`, 0 ruchów. GAM ma zakres tylko sesji tego mostu, nie całego serwera.
- TCP do hosta gry: handshake 147 ms, `payload_sent=false`; nie było logowania ani komendy do gry.
- Fallback produkcyjnego PL1: `unavailable`, 2021 lokacji `source_unavailable`, `persisted=false`, `attack_time_inferred=false`.

**Wniosek:** ostatni test nadal potwierdza brak obsługi fortec produkcyjnego PL1 w GGE Tracker. Beta nie jest zamiennikiem PL1.

## 4. Testy kodu i mobilności

Workflow `42285478811` zakończył się sukcesem:
- Python — lokalna sonda mapy: 13/13 testów;
- importer IT1: 19/19 testów;
- rdzeń sondy Node: 60/60 testów;
- fallback GGE Tracker: 8/8 testów;
- plan skanu: 2021 celów, 199 sektorów 100×100, 1 990 000 potencjalnych pól;
- test UI Barony: PASS — breakpoint mobilny, obszary dotykowe 44 px, focus, etykiety lokalnej historii i separacja dowodów;
- walidacja katalogu: PASS — 2021 unikalnych współrzędnych bez pól ataku/cooldownu/gotowości.

To są testy CI/statyczne, nie test na fizycznym telefonie.

## 5. Publikacja strony

Ostatni niezależnie potwierdzony deployment GitHub Pages:
- workflow `42283839593`;
- build i deploy — SUCCESS;
- wdrożony commit `ca946cb0a89c36fb5760ad9e62903d492d09142a`;
- potwierdzenie Pages: 2026-11-06 19:56:20 UTC.

Późniejsze commity nie zmieniły plików Barony ani katalogu fortec, więc zawartość tych dwóch elementów odpowiada wdrożonej wersji. Nie udało się jednak wykonać nowego bezpośredniego odczytu strony w tej iteracji.

## 6. Ograniczenia bieżącego audytu i UI

- Bezpośrednie próby połączenia z GitHub Pages i API GGE Tracker z bieżącego środowiska zakończyły się błędem DNS `Temporary failure in name resolution`.
- Dodatkowy live fetch przez Firecrawl nie został wykonany: połączenie zgłosiło brak dostępnych kredytów. Nie ponawiano go.
- `barony.html` pobiera katalog IT1 osobno od lokalnej historii. W UI istnieją lokalne wpisy ręczne i lokalny 24-godzinny status w `localStorage`; nie pochodzą one z pól cooldownu IT1 ani z automatycznej historii PL1. Nie są dowodem serwerowego ataku.

## 7. Historia ataków PL1 i następny krok

- Nowe potwierdzone ataki produkcyjnego PL1 w tej iteracji: **0**.
- Nie zapisano żadnych zdarzeń.
- `attack_time_utc` pozostaje `null`.
- Ruchy GAM są ograniczone do sesji konta; raporty SNE/BLS/BLM są ograniczone do skrzynki tego konta. Czasy PT/TT i dostarczenia raportów pozostają estymatami; semantyka BLS/BLM `PS` nie jest potwierdzona.
- Rozstrzygający następny krok to lokalny, autoryzowany test produkcyjnego PL1 przez `node scripts/barony-live/probe.mjs --movements --reports --no-state`. Poświadczenia muszą pozostać wyłącznie w lokalnych zmiennych środowiskowych. Bez takiego testu nie wdrażać pollera ani globalnej historii.

**Status końcowy iteracji:** katalog IT1 jest poprawny i ma potwierdzony wcześniejszy deployment; bieżącego live odświeżenia pełnego katalogu nie udało się wykonać z tego środowiska. Historia ataków produkcyjnego PL1 nadal nie jest potwierdzona.
