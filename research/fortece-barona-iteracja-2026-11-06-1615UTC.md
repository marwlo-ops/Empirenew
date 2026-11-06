# Iteracja fortec IT1 / PL1 — 2026-11-06 16:15 UTC

## Podsumowanie

Wykonano świeży import mapy z GGE Tracker IT1, ponowną walidację katalogu, testy importera, diagnostykę kompatybilności PL1 oraz sprawdzenie build/deployment. Wprowadzono dwie małe poprawki bezpieczeństwa w zakresie modułu fortec.

## 1. Świeży import IT1

- Źródło: `GET /api/v1/dungeons`, nagłówek `gge-server: IT1`.
- Czas snapshotu: `2026-11-06T16:11:20.414334+00:00`.
- Workflow importu: [42249973970](https://github.com/marwlo-ops/Empirenew/actions/runs/42249973970) — SUCCESS.
- Commit danych: [39c9511](https://github.com/marwlo-ops/Empirenew/commit/39c951152eb7b3a43747437a9a7ee33b6f8c4374).
- Paginacja: 1/1.
- Piaski: 671; Lód: 779; Ogień: 571; razem 2021.
- Walidacja po imporcie: 2021 rekordów, 2021 unikalnych ID, 2021 unikalnych współrzędnych, 0 duplikatów, 0 błędnych współrzędnych.
- Każdy rekord zawiera wyłącznie: `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`.
- Rekurencyjna kontrola katalogu: 0 pól cooldown/gotowości/dostępności/gracza/ataku.
- Plan skanowania: 2021 celów, 199 sektorów 100×100, 1 990 000 potencjalnych pól.

Porównanie z poprzednim snapshotem z 13:19:51 UTC: 0 nowych lokalizacji, 0 usuniętych, 0 zmienionych identyfikatorów przy tych samych współrzędnych.

**Ograniczenie:** współrzędne pochodzą z IT1. Zgodność siatki z PL1 pozostaje potwierdzeniem operatora; importer nie dowodzi bieżącej obecności wszystkich 2021 obiektów na żywej mapie PL1.

## 2. Zmiany kodu

### PR #23 — scalony

[PR #23](https://github.com/marwlo-ops/Empirenew/pull/23), commit `26dbb215`.

- Dodano ścisłą allowlistę kluczy najwyższego poziomu publicznego katalogu.
- Dodano rekurencyjne wykrywanie pól dynamicznych na każdym poziomie JSON.
- Dodano kontrolę wersji schematu, targetu PL1, liczby stron i jawnego statusu operator-confirmed.
- Test mobilny i walidator katalogu: PASS w [42249129698](https://github.com/marwlo-ops/Empirenew/actions/runs/42249129698).

### PR #24 — scalony

[PR #24](https://github.com/marwlo-ops/Empirenew/pull/24), commit `ac16cc19`.

- Ograniczono odczyt pojedynczej odpowiedzi API importera do 8 MiB.
- Odrzucane są nadmierne/nieprawidłowe `Content-Length` oraz faktycznie zbyt duże body.
- Niepoprawny UTF-8/JSON kończy import bez nadpisania poprzedniego katalogu.
- Dodano testy regresyjne dla normalnej, nadmiernej i niepoprawnej odpowiedzi.
- Zaktualizowano workflow probe, aby uruchamiał testy importera.

Wynik [42249676545](https://github.com/marwlo-ops/Empirenew/actions/runs/42249676545): PASS; testy importera 18/18, probe PL1 offline 13/13, testy Node 56/56.

## 3. PL1 — potwierdzone wyniki diagnostyki

Workflow: [42249974007](https://github.com/marwlo-ops/Empirenew/actions/runs/42249974007) — SUCCESS jako przebieg diagnostyczny.

- TCP do `e4k-live-pl1-game.goodgamestudios.com:443`: połączenie przyjęte, 174 ms; payload nie został wysłany.
- GGE Tracker `E4K_PL1`: HTTP 400 — produkcyjny alias nie jest obsługiwany przez endpoint `/dungeons`.
- Nazwa strefy `EmpirefourkingdomsExGG_3`: HTTP 400 w GGE Tracker.
- Katalog serwerów: produkcyjne `E4K_PL1` ma `code=null`, `fortress=false`; Beta ma `fortress=true`.
- GGE Tracker Beta: HTTP 200, 976 fortec. To oddzielny serwer; dane Beta nie są używane jako dowód PL1.
- Publiczny most: HTTP 200 dla statusu, ale `target_connected=false`.
- Historia gracza produkcyjnego PL1 została bezpiecznie pominięta, ponieważ brak zweryfikowanego trzycyfrowego sufiksu kodu GGE Tracker. `zoneId=259` nie jest jego zamiennikiem.

### Audyt timestampu

W najnowszym read-only probe 8 próbek IT1 wykazało różnicę `global_available_at - last_attack` w zakresie 86 298–86 377 sekund; 8 próbek Beta: 86 284–86 399 sekund. To silna korelacja bliska 24 h, ale nie dowód pochodzenia ani dokładności `last_attack`. Kod scrapera nie przekazuje jawnie `attacked_at` przy INSERT do `dungeons_history`; schemat/trigger produkcyjnej bazy nie został potwierdzony. Nie przeliczamy tych wartości na dokładny czas ataku.

**Potwierdzone nowe ataki produkcyjnego PL1: 0.** Nie zapisano zdarzeń fikcyjnych.

## 4. Build, deployment i mobilność

- Import i walidacja katalogu: PASS.
- Testy importera: 18/18 PASS.
- Testy offline PL1: 13/13 PASS.
- Testy Node probe core: 56/56 PASS.
- Test mobilny: PASS — viewport, cele dotykowe 44 px, focus states, etykiety lokalnej historii i rozdzielenie obserwacji od potwierdzonych zdarzeń.
- GitHub Pages build/deploy dla snapshotu `39c9511`: [42250017031](https://github.com/marwlo-ops/Empirenew/actions/runs/42250017031) — SUCCESS.

Test mobilny jest automatyczny; nie wykonano testu na fizycznym telefonie.

## 5. Zakres i ograniczenia

Nie modyfikowano zakładek Mapa, Szpiegowanie ani Dodatkowe. Nie zmieniano `barony.html` ani `mapa-rb.html`.

Nie wykonano logowania do konta demo. GAM i SNE są źródłami ograniczonymi do autoryzowanej sesji/konta; bez lokalnej sesji produkcyjnego PL1 nie ma potwierdzonego odczytu ruchów ani raportów NPC. Nie należy umieszczać poświadczeń w repozytorium, GitHub Actions ani czacie.

Firecrawl MCP był niedostępny z powodu wyczerpanego limitu kredytów. Świeży import IT1 wykonano bezpośrednio przez workflow GitHub Actions z runnera, a nie przez Firecrawl.

## 6. Następny krok

1. Uruchomić lokalny read-only probe na autoryzowanej sesji produkcyjnego PL1.
2. Potwierdzić odpowiedź GAA na małym obszarze i zgodność `KID/X/Y`, typu 11 oraz właściciela NPC.
3. Odczytać GAM i raporty SNE/BLS/BLM dostępne temu kontu; rozdzielić ruch w drodze od zakończonej bitwy.
4. Nie publikować globalnej historii ani dokładnego czasu, dopóki źródło czasu nie zostanie niezależnie zweryfikowane.
5. Pozostawić dane Beta/IT1 wyłącznie jako źródło współrzędnych/testów, nie jako historię PL1.

Następny harmonogram importu IT1: cron `17 */6 * * *` (kolejny termin 18:17 UTC).
