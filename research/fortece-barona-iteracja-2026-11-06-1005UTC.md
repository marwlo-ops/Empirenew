# Iteracja Barony — IT1 i produkcyjny PL1

**Data:** 2026-11-06, 10:00–10:05 UTC  
**Repozytorium:** `marwlo-ops/Empirenew`  
**Gałąź:** `main`

## 1. Świeży import GGE Tracker IT1

Zmiana dokumentacyjna w importerze doprecyzowała, że metadane paginacji są obowiązkowe, a ich brak ma zatrzymywać import i zachowywać poprzedni katalog.

- Commit poprawki opisu kontraktu: `b7b4168e7a5f6f72bf51a9fab1fafdcdd43c631a`.
- Następnie bot GitHub Actions utworzył commit danych `fe34b38c5228c363af18e0a364b7be13668fea7f` o 10:01:37 UTC.
- Snapshot w katalogu: `2026-11-06T10:01:36.565058+00:00`.
- Źródło: publiczne API GGE Tracker, nagłówek `gge-server: IT1`.
- Paginacja: 1 strona; katalog oznaczony jako kompletny.

| Kraina | Liczba |
|---|---:|
| Piaski | 671 |
| Lód | 779 |
| Ogień | 571 |
| **Razem** | **2021** |

Porównanie ze snapshotem z 07:29:05 UTC:
- dodane współrzędne: 0;
- usunięte współrzędne: 0;
- 2021/2021 lokalizacji pozostało identycznych.

Commit automatycznego importu zmienił wyłącznie `data/baron-fortresses.json` — czas snapshotu, nie współrzędne.

## 2. Walidacja katalogu

Ponownie odczytano aktualny plik z `main` i niezależnie przeliczono rekordy:

- 2021 rekordów;
- 2021 unikalnych ID;
- 2021 unikalnych współrzędnych;
- dokładnie trzy grupy: `sands`, `ice`, `fire`;
- każdy rekord ma dokładnie siedem pól: `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`;
- 0 nieprawidłowych współrzędnych;
- 0 pól cooldownu, gotowości, ataku, gracza lub defeatera.

## 3. Małe poprawki walidatora — 3 commity

Wykryta luka: walidator sprawdzał trzy wymagane krainy, ale nie odrzucał dodatkowej, nieznanej grupy w `results`. Taka grupa byłaby ignorowana podczas iteracji po znanych krainach.

Poprawiono:
1. `validateMapOnlyCatalog()` wymaga dokładnie grup `sands/ice/fire`;
2. dodano regresję odrzucającą nieznaną grupę;
3. `scripts/test-baron-map-catalog.mjs` wymaga tego samego kontraktu dla katalogu publikowanego.

Commity:
- `467265ec7b1bedd9a4c41e8e4a8c450bba815af4` — walidator runtime;
- `aef4ff124af3a499937b4bd549c0c43b6f0759f4` — test regresyjny;
- `f8ce13d3a7cd5033a1684425de4e189ac77e8743` — walidator katalogu.

Izolowany harness JavaScript dla dokładnego zestawu, dodatkowej grupy i brakującej grupy: 3/3 PASS. Aktualny katalog przechodzi kontrolę dokładnych grup.

Dostępny endpoint statusów commitów zwrócił pustą listę dla trzech nowych commitów kodu. Nie oznaczam więc pełnego GitHub Actions po tych zmianach jako PASS; oczekiwane workflow nie są w tym interfejsie widoczne.

## 4. Produkcyjny PL1 — źródła i ograniczenia

Nie wykonano autoryzowanego logowania do gry w tej iteracji. Nie było nowych odczytów GAA/GAM ani raportów NPC z produkcyjnego PL1.

Potwierdzone w istniejącym dzienniku badań:
- GGE Tracker `E4K_PL1` ma `fortress=false`; endpoint `/dungeons` dla produkcyjnego PL1 zwracał HTTP 400. IT1 i PL1 Beta pozostają odrębnymi źródłami.
- Publiczny `/server/movements` GGE Tracker opisuje zmiany lokalizacji zamków, nie marsze armii do NPC; nie jest źródłem historii ataków na fortece.
- `dungeons_history.attacked_at` nie ma potwierdzonego pochodzenia jako serwerowy czas ataku. Widoczny scraper nie przekazuje tego pola w INSERT.
- `GAM` jest ograniczony do ruchów widocznych dla zalogowanego konta; wyliczony lokalnie czas odjazdu nie jest dokładnym timestampem serwera.
- Raport NPC może potwierdzić cel i atakującego w skrzynce zalogowanego konta, ale czas dostarczenia raportu nie jest czasem rozpoczęcia ataku.
- `BLS.PS` i `BLM.PS` pozostają niezweryfikowanymi polami liczbowymi w przypiętym `ggejs`; kod nie interpretuje ich semantyki. Nie wyliczamy z nich czasu bitwy.

Nie zapisano zdarzeń ataku. `attack_time_utc` pozostaje `null`.

## 5. Build, deployment i mobilność

- Importer utworzył commit danych dopiero po krokach testów Python, importu, walidacji katalogu i planu Barony zdefiniowanych w workflow. Pełne logi runu nie były dostępne w tym interfejsie.
- Nowy snapshot `fe34b38` nie ma w tej iteracji niezależnie potwierdzonego Pages deploymentu. Ostatni potwierdzony w dzienniku Pages deployment dotyczył wcześniejszego commitu `02beca2274eb69958d2961558badd56a29dab0ce`.
- Najnowsze status checks dla trzech commitów walidatora zwróciły puste listy; nie deklarujemy nowego PASS CI.
- Nie zmieniono HTML/CSS interfejsu, więc nie wprowadzono regresji UI przez tę iterację. Nowy wynik automatycznego testu mobilnego nie jest dostępny; test fizycznego telefonu nie został wykonany.

## 6. Zakres ochrony i blokady

Nie zmieniono zakładek Mapa, Szpiegowanie ani Dodatkowe, ani plików `barony.html` i `mapa-rb.html`.

PR #13 — własny most API — nadal jest draftem, nie jest wdrożoną usługą. Gałąź ma 28 commitów do przodu i 10 do tyłu względem `main`; nie scalano jej ani nie wdrażano, aby uniknąć integracji rozjechanej gałęzi bez ponownego review.

**Blokada historii PL1:** brak autoryzowanej sesji produkcyjnego PL1 i brak potwierdzonego globalnego feedu zdarzeń dla każdej fortecy. Dane Beta/IT1 nie są używane jako historia PL1.

## 7. Następny krok

Operator uruchamia lokalnie read-only probe na koncie demo **na produkcyjnym E4K PL1**, używając lokalnych zmiennych `E4K_USERNAME` i `E4K_PASSWORD`:

```bash
node scripts/barony-live/probe.mjs --movements --reports
```

Nie przekazywać hasła w czacie, repozytorium ani GitHub Actions. Wynik powinien być zredagowany przed udostępnieniem. Najpierw potwierdzamy dokładne KID/X/Y, właściciela NPC, uczestników raportu i powiązanie MID/LID; nie podnosimy żadnego sygnału do potwierdzonego ataku bez niezależnego dowodu czasu i celu.
