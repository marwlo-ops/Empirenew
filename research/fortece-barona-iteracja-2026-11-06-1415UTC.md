# Empirenew — raport iteracji fortec IT1 / diagnostyki PL1
**2026-11-06, stan źródeł i CI około 14:15 UTC**

## 1. Stan repozytorium i katalogu IT1

- Repozytorium: `marwlo-ops/Empirenew`, domyślna gałąź `main`.
- Main podczas przeglądu: `e53df34ba1733b18c575b5a361bd326c267b6449`.
- Najnowszy import IT1: workflow `42224602686`, run 16, SUCCESS.
- Commit snapshotu: `9d11d05910b05b5fbdac05df8da118eaa84a5499`.
- `captured_at`: `2026-11-06T13:19:51.085842+00:00`.
- GGE Tracker IT1: 2021 rekordów, jedna strona, complete=true.
- Piaski 671, Lód 779, Ogień 571.
- Niezależna walidacja pliku na main: 2021 rekordów, 2021 unikalnych ID, 2021 unikalnych współrzędnych.
- Wszystkie rekordy mają dokładnie siedem kluczy: `id`, `kid`, `kingdom`, `source_server`, `type`, `x`, `y`.
- Rekurencyjny przegląd nazw kluczy nie znalazł pól cooldownu, gotowości/dostępności, gracza, ataku ani defeatera.
- Metadane katalogu jawnie mówią, że źródłem współrzędnych jest IT1, a dopasowanie siatki do PL1 jest potwierdzeniem operatora, nie niezależnym live odczytem każdego obiektu PL1.

Pages run `42224628378` dla snapshotu zakończył się SUCCESS. Kolejny Pages run `42228800342` dla późniejszego commitu trackerów również zakończył się SUCCESS i zawierał snapshot IT1. Dla najnowszego kodu `e53df34` Pages run `42232180892` był jeszcze `in_progress` podczas odczytu; nie deklarować jego zakończenia bez ponownego sprawdzenia.

## 2. PL1 — ostatni rzeczywisty probe

Workflow `42232181469` zakończył się SUCCESS, ale jest to status workflow, nie potwierdzenie historii ataków.

Log wykazał:
- TCP handshake do `e4k-live-pl1-game.goodgamestudios.com:443` — 177 ms; payload_sent=false.
- Katalog GGE Tracker: `E4K_PL1` ma `enabled=true`, `fortress=false`, `code=null`.
- `/dungeons` dla `E4K_PL1` — HTTP 400, serwer nieobsługiwany.
- `E4K_PL1_BETA` — HTTP 200, 976 fortec; Beta pozostaje odrębnym środowiskiem i nie jest źródłem historii produkcyjnego PL1.
- Publiczny bridge: `target_connected=false`; GAA/GAM przez bridge pominięto.
- Brak autoryzowanej sesji konta demo; workflow nie logował się do gry i nie wysyłał komend gry.

Workflow diagnostyki NPC `42232181306` zakończył się FAILURE:
- GAA i FNM przez publiczny bridge zwróciły HTTP 500.
- GGE Tracker odrzucił produkcyjne `E4K_PL1` jako nieobsługiwany.
- Beta/IT1 odpowiedziały, ale ich dane nie zostały użyte jako historia PL1.
- Nie zmodyfikowano produkcyjnego snapshotu.

## 3. Testy na main

Workflow bezpieczeństwa `42232181078` zakończył się SUCCESS:
- Python: 10/10 testów redakcji diagnostyki `scan_npc_map.py`.
- Node: 56/56 testów katalogu i parserów Barony.
- Mobilny test automatyczny w workflow PL1: PASS — viewport, cele dotykowe 44 px, focus states, etykiety historii lokalnej i składnia inline JS.
- Plan skanowania: 2021 celów, 199 sektorów 100×100, 1 990 000 potencjalnych pól.

## 4. Nowo wykryty problem bezpieczeństwa artefaktu

Log workflow `42232181306` ujawnił, że `scripts/probe_gge_tracker.py` umieszczał surowy `body_preview` odpowiedzi API w raporcie uploadowanym jako publiczny artefakt GitHub Actions. Przykładowa odpowiedź Beta/IT1 zawierała nazwy i ID graczy, statystyki, znaczniki czasu ataków i cooldownu.

Przygotowano wąską poprawkę na gałęzi:
`fix/barony-tracker-probe-redaction-20261106`

Zmiany:
- usunięto `body_preview` z sukcesów i błędów HTTP;
- nie emituje się wartości graczy, ataków ani cooldownów;
- zostają tylko status HTTP, liczba próbek, ograniczone współrzędne, bezpieczna paginacja oraz flagi obecności pól dynamicznych;
- błędy transportu raportują wyłącznie typ wyjątku;
- dodano testy regresyjne dla sukcesu, HTTP error, invalid JSON, transport error, dynamicznych kluczy i nieprawidłowej paginacji;
- workflow bezpieczeństwa uruchamia nowy zestaw testów.

Na moment zapisu raportu zmiany są na gałęzi i oczekują na CI/PR review. Nie są jeszcze scalone ani wdrożone.

## 5. Historia ataków — status

- Potwierdzone nowe zdarzenia produkcyjnego PL1: 0.
- Nie dopisano żadnych zdarzeń.
- `attack_time_utc` pozostaje null bez niezależnego dowodu.
- `attacked_at`/ `last_attack` z IT1/Beta nie są używane jako historia PL1.
- `zoneId=259` nie jest traktowany jako trzycyfrowy kod GGE Tracker.
- Następny niezbędny krok: autoryzowany lokalny probe konta demo na produkcyjnym PL1; bez przesyłania hasła do czatu lub CI.

## 6. Zakres ochrony

Nie zmieniano zakładek Mapa, Szpiegowanie ani Dodatkowe, ani plików `barony.html` i `mapa-rb.html`. Zmiany dotyczą wyłącznie diagnostyki publicznego API, testów i dokumentacji.
