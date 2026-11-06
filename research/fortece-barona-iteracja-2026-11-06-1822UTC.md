# Raport iteracji — fortece IT1 i diagnostyka E4K PL1

**Data:** 2026-11-06  
**Zakres odczytu:** stan repozytorium i workflow do 18:21 UTC  
**Gałąź bazowa:** `main`  
**Commit bazowy:** `87f038b35dfa6ac2ba0fc8f3482e849b62306c6a`

## 1. Katalog mapy IT1 — odczyt i walidacja

Aktualny plik `data/baron-fortresses.json` ma metadane:

- `captured_at`: `2026-11-06T18:14:54.817773Z`
- źródło: publiczne API GGE Tracker, serwer `IT1`
- cel mapowania: `E4K_PL1`
- paginacja: 1 strona, `complete=true`
- `total_count=2021`

| Kraina | Rekordy |
|---|---:|
| Piaski | 671 |
| Lód | 779 |
| Ogień | 571 |
| **Razem** | **2021** |

Niezależna walidacja pobranego JSON:

- 2021 rekordów;
- 2021 unikalnych ID;
- 2021 unikalnych kluczy współrzędnych KID:X:Y;
- 0 nieprawidłowych współrzędnych;
- 0 nieznanych lub zabronionych kluczy w rekordach;
- dokładnie siedem kluczy każdego rekordu: `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`.

W katalogu nie ma pól cooldownu, gotowości, gracza, atakującego ani czasu ataku. Walidator runtime dodatkowo odrzuca pola z nazwami związanymi z atakiem, graczem, cooldownem, gotowością i dostępnością.

**Ograniczenie:** `coordinate_alignment=operator_confirmed; not independently live-verified by this importer`. Importer potwierdza dane mapy IT1, a nie aktualną obecność wszystkich obiektów na żywej mapie produkcyjnego PL1.

## 2. Publiczny GGE Tracker dla produkcyjnego PL1

Najnowszy workflow `Probe PL1 fortress API` (`42269802737`) wykonał read-only probe.

Potwierdzone wyniki:

- `E4K_PL1`: HTTP 400 — produkcyjny serwer odrzucony przez endpoint `/dungeons`;
- `EmpirefourkingdomsExGG_3`: HTTP 400;
- `E4K_PL1_BETA`: HTTP 200, osobny serwer Beta;
- `IT1`: HTTP 200;
- katalog serwerów zwraca dla produkcyjnego `E4K_PL1` `enabled=true`, ale `fortress=false` i brak kodu GGE Tracker;
- Beta ma `fortress=true`, ale nie jest źródłem danych produkcyjnego PL1.

Nowy adapter `scripts/barony-live/gge-tracker-fallback.mjs` wykonał osobny odczyt produkcyjnego PL1. Wynik:

```json
{
  "server": "E4K_PL1",
  "result_status": "unavailable",
  "meta_status": "unavailable",
  "kingdom_statuses": {
    "sands": "unsupported_or_rejected_server_filter",
    "ice": "unsupported_or_rejected_server_filter",
    "fire": "unsupported_or_rejected_server_filter"
  },
  "summary": {
    "catalog_targets": 2021,
    "tracker_rows_matched": 0,
    "not_confirmed": 0,
    "ambiguous": 0,
    "source_unavailable": 2021
  },
  "persisted": false,
  "attack_time_inferred": false
}
```

Ważne: 2021 pozycji ma status `source_unavailable`, a nie `not_confirmed_by_tracker`. Błąd API nie jest dowodem nieobecności fortec.

Dane IT1 i Beta nie zostały skopiowane do historii PL1.

## 3. Publiczny most `empire-api.fly.dev` — GAM

W najnowszym probe:

- `/status`: HTTP 200;
- socket `EmpirefourkingdomsExGG_3`: `connected=true`;
- komenda `GAM`: HTTP 200, `return_code=0`;
- odpowiedź zawiera klucze `M` i `O`;
- liczba zwróconych ruchów: 0;
- liczba potwierdzonych wychodzących ataków na fortece NPC: 0.

To potwierdza, że żądanie GAM zostało przyjęte przez podłączoną sesję mostu i zwróciło pusty zbiór ruchów widocznych dla tej sesji. Nie potwierdza braku ataków na całym serwerze PL1 ani globalnej kompletności danych.

Komenda GAA została jawnie pominięta. Publiczny most nie ma mapowania kluczy odpowiedzi GAA, a jego ogólny matcher wymagałby echa parametrów żądania. Nie wysłano żądania GAA, które mogłoby błędnie dopasować odpowiedź.

Commit `87f038b` naprawia wcześniejszy problem pustego segmentu ścieżki Express dla GAM: pusty obiekt nagłówków jest kodowany jako niepusty segment `%20`, który po dekodowaniu daje `{}`. Dodano testy round-trip oraz odrzucania nieprawidłowych wejść. Najnowszy live probe potwierdził działanie żądania GAM po tej poprawce.

## 4. Połączenie gry i konto

- TCP do `e4k-live-pl1-game.goodgamestudios.com:443`: połączenie przyjęte, ok. 172 ms;
- payload gry nie został wysłany w teście TCP;
- nie wykonano autoryzowanego logowania kontem demo w GitHub Actions;
- nie wykonano odczytu SNE ani raportów NPC z prywatnej skrzynki użytkownika.

GAM z publicznego mostu i lokalny, autoryzowany odczyt GAM/SNE to różne źródła. Ruchy i raporty z konta są ograniczone do tego, co konto może zobaczyć; nie stanowią globalnego feedu PL1.

## 5. Czas ataku i zapis zdarzeń

- `attack_time_utc` pozostaje `null`;
- `last_attack` z IT1/Beta pozostaje niezweryfikowanym polem dostawcy;
- `BLS.PS` i `BLM.PS` pozostają metadanymi o nieudokumentowanej semantyce w przypiętym kliencie;
- nie wyliczono czasu ataku z cooldownu ani z różnicy 24 godzin;
- nie dopisano żadnego zdarzenia ataku do historii PL1.

**Liczba nowych potwierdzonych zdarzeń ataków PL1: 0.**

## 6. Testy i publikacja

Najnowsze zakończone workflow:

- `Probe PL1 fortress API` — run `42269802737`: SUCCESS.
  - test mapy PL1 offline: 13/13;
  - test importera IT1: 19/19;
  - rdzeń probe Barony: 60/60;
  - fallback GGE Tracker: 8/8;
  - walidacja katalogu: PASS;
  - plan skanowania: PASS;
  - kontrola metadanych klienta E4K: PASS;
  - test mobilnego interfejsu Barony: PASS.
- `Barony catalog and diagnostic safety` — run `42269802957`: SUCCESS.
  - testy redakcji i routingu diagnostycznego: 17/17;
  - testy redakcji probe GGE Tracker: 7/7;
  - testy walidatora katalogu i parserów: PASS.
- `pages build and deployment` — run `42269802026`: SUCCESS.
  - build: SUCCESS;
  - deploy: SUCCESS;
  - report-build-status: SUCCESS.

Poprzednia próba Pages `42268962248`, attempt 2, zakończyła build poprawnie, ale deploy długo pozostawał w stanie `deployment_queued` i zakończył się ogólnym błędem „Deployment failed, try again later”. Kolejny deployment `42269802026` zakończył się sukcesem, więc ostatnia próba publikacji została odzyskana. Niezależny test HTTP strony z zewnętrznej przeglądarki nie został wykonany.

Test mobilny jest automatycznym testem DOM/CSS/JS (viewport, media query, przyciski dotykowe 44 px, focus states, etykiety historii i składnia inline JS), a nie testem na fizycznym telefonie.

## 7. Otwarte blokady i PR mostu

PR #13 `Secure custom Empire API bridge kit for PL1 diagnostics` pozostaje draftem i nie został scalony ani wdrożony. Porównanie z aktualnym `main` wykazało rozjazd:

- gałąź PR: 28 commitów do przodu;
- gałąź PR: 47 commitów do tyłu;
- wspólny punkt bazowy: `5511a5e`;
- aktualny `main`: `87f038b`.

Nie należy scalać tej gałęzi bez aktualizacji/rebase i ponownego testu patcha. Nie utworzono usługi Render i nie skonfigurowano sekretów. Patch mostu z mapowaniem GAA/FNM pozostaje propozycją, nie działającym endpointem.

## 8. Zakres ochrony

Nie zmieniono zakładek Mapa, Szpiegowanie ani Dodatkowe, ani plików `barony.html` i `mapa-rb.html`.

## 9. Następne kroki

1. Zaktualizować/rebase PR #13 na aktualnym `main` albo przygotować czysty, mały PR zawierający tylko bezpieczny patch mostu.
2. Dodać i przetestować mapowanie odpowiedzi GAA/FNM w kontrolowanym forku; dopiero po wdrożeniu Bearer auth wykonać read-only test na PL1.
3. Wykonać lokalny test `scripts/barony-live/probe.mjs --movements --reports` na osobnym koncie demo PL1, bez przekazywania haseł do repozytorium, Actions ani czatu.
4. Skorelować raport NPC z dokładnym KID/X/Y oraz ID gracza; semantykę czasu potwierdzić niezależnie przed zapisaniem czasu ataku.
5. Dopiero po potwierdzeniu niezależnym dowodem zapisywać zdarzenia. Do tego czasu brak zdarzeń pozostaje brakiem dowodu, a nie dowodem braku ataków.
