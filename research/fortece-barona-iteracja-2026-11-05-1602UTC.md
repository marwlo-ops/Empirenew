# Raport iteracji — fortecy IT1 / odczyt PL1
Data: 2026-11-05 16:02 UTC

## Zakres i wynik

Kontynuowano wyłącznie moduł Barony oraz jego lokalny, read-only probe. Nie zmieniano zakładek Mapa, Szpiegowanie ani Dodatkowe. Nie zmieniano też publicznego interfejsu `barony.html`.

## Katalog IT1

Ponownie zweryfikowano katalog znajdujący się na `main`:
- źródło zadeklarowane w danych: GGE Tracker, IT1, tylko współrzędne;
- snapshot: `2026-11-05T15:11:37.173Z`;
- Piaski: 671, Lód: 779, Ogień: 571, razem 2021;
- walidacja rdzenia probe: kompletność, zgodność KID/krainy/typu/źródła, zakres współrzędnych i brak duplikatów — PASS;
- plan pełny: 2021 celów, 199 sektorów 100×100, szacunkowo 1 990 000 pól;
- domyślna próbka: 9 celów, 9 sektorów.

**Ograniczenie świeżości:** w tej iteracji nie wykonano nowego pobrania HTTP z GGE Tracker. Połączenie Firecrawl zwróciło brak dostępnych kredytów, a użyty interfejs web nie pozwala przekazać wymaganego nagłówka `gge-server: IT1`. Nie oznaczamy więc snapshotu 15:11 UTC jako świeżo pobranego w tej iteracji. Jego zawartość i integralność zostały ponownie sprawdzone z repozytorium.

## Zmiany kodu

1. `probe-core.mjs`: brak `attackCooldownEnd` jest teraz stanem nieznanym (`null`), a nie brakiem cooldownu (`false`). Zapobiega to fałszywemu kandydackiemu sygnałowi, gdy pole pojawi się dopiero w kolejnym odczycie.
2. `probe-core.mjs`: niepoprawny znacznik czasu próbki jest odrzucany, zamiast klasyfikować stan cooldownu na podstawie `NaN`.
3. `probe-core.test.mjs`: dodano dwa testy regresyjne: brak cooldownu nie wywołuje sygnału startu; błędny czas próbki jest odrzucany. Plik zawiera obecnie 12 przypadków testowych.
4. `probe.mjs`: czas obserwacji jest zapisywany po otrzymaniu odpowiedzi mapy, a nie przed wysłaniem żądania.
5. `README.md`: opisano semantykę nieznanego cooldownu i moment pobrania znacznika czasu.

Commity:
- `7ed7a5f` — bezpieczna obsługa nieznanego cooldownu;
- `bd055cb` — testy regresyjne;
- `a2084cc` — timestamp po odpowiedzi mapy;
- `4aba853` — dokumentacja.

## Testy wykonane w tej iteracji

Uruchomiono kod rdzenia pobrany z aktualnego `main` w izolowanym środowisku JavaScript:
- walidacja rzeczywistego katalogu IT1 — PASS;
- plan pełny 2021/199 — PASS;
- plan domyślny 9/9 — PASS;
- brak cooldownu nie powoduje sygnału startu — PASS;
- niepoprawny timestamp jest odrzucany — PASS;
- wzrost licznika nadal jest oznaczany wyłącznie jako kandydacki sygnał — PASS.

Testów `node --test` w runnerze GitHub Actions nie można w tej iteracji potwierdzić: status commitu zwrócił pustą listę statusów, a dostępny konektor nie udostępnia listowania runów uruchomionych zdarzeniem `push`. Nie deklarujemy zatem PASS CI ani nowego deploymentu.

## PL1 — historia ataków

Nie wykonano logowania live do produkcyjnego E4K PL1: środowisko tej iteracji nie ma poświadczeń operatora. Nie wysłano loginu ani hasła, nie uruchomiono pełnego skanu i nie zapisano żadnych zdarzeń ataku.

Znane, ostatnio potwierdzone ograniczenia pozostają aktualne:
- GGE Tracker przyjmuje IT1 i E4K_PL1_BETA, ale testowany endpoint fortec odrzuca produkcyjny E4K_PL1;
- dane Beta nie są używane jako dane produkcyjne PL1;
- publiczny most i jego komendy mapy nie dostarczyły dotąd potwierdzonej historii per lokacja;
- `attackCount` i cooldown z pojedynczej próbki nie identyfikują gracza ani dokładnego czasu ataku.

Nowe poprawki nie zmieniają tych ograniczeń. Kandydackie przedziały pozostają poza rejestrem potwierdzonych zdarzeń.

## Build, deployment i mobile

- `barony.html`: SHA pozostał `abd38134d32230d50528e81a9717adfcd85b61bb` — bez zmian.
- `data/baron-fortresses.json`: SHA pozostał `a35ada36479b721204a916b97c9ae6fd83605c0c` — bez zmian.
- Nie zmieniono UI ani danych publikowanych przez Pages, więc nie było potrzeby wykonywania nowego deploymentu Pages.
- Nie uzyskano potwierdzenia nowego przebiegu workflow push dla najnowszych commitów.
- Test fizyczny na telefonie nie został wykonany; nie wprowadzano zmian mobilnego UI.

## Następny krok

1. Po odnowieniu limitu źródła zewnętrznego ponownie pobrać IT1 przez endpoint z nagłówkiem `gge-server: IT1` i porównać 2021 współrzędne.
2. Potwierdzić wynik workflow `baron-pl1-probe.yml` dla nowych commitów.
3. Uruchomić lokalny test 9 punktów na autoryzowanej sesji PL1, a następnie powtórzyć odczyt po 10–15 minutach. Porównać licznik i cooldown; nadal nie przypisywać gracza ani dokładnego czasu bez niezależnego dowodu.
4. Dopiero po potwierdzeniu zachowania live sprawdzić, czy strumień ruchów pozwala połączyć atak z konkretną fortecą i graczem.
