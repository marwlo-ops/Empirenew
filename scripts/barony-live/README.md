# Lokalny odczyt mapy fortec E4K PL1

Narzędzie jest **read-only**. Korzysta z klienta E4K `ggejs` i danych serwerów `e4k-data`; nie wysyła ataków ani szpiegowania.

## Dlaczego ten klient

- Dane `e4k-data` wskazują PL1 jako `EmpirefourkingdomsExGG_3`, host `e4k-live-pl1-game.goodgamestudios.com`, instancję 3.
- `ggejs` wybiera transport TCP dla stref zaczynających się od `EmpirefourkingdomsExGG`. Klient `EmpireCore` tworzy URL WSS, więc jego obsługa E4K PL1 nie jest potwierdzona.
- Odczyt `gaa` zwraca wiersze mapy. `ggejs` parsuje typ `DUNGEON` (2), X/Y, `attackCount`, `attackCooldownEnd` i KID. Dla KID 1/2/3 mapuje właściciela NPC na -220/-221/-222.

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

Domyślnie odpytuje maksymalnie 3 punkty na krainę. Każdy odczyt sektora obejmuje 100×100 pól; przerwa między zapytaniami wynosi co najmniej 1000 ms.

## Pełny plan

```sh
node scripts/barony-live/probe.mjs --plan --all
```

Aktualny katalog IT1 ma 2021 punktów i 199 unikalnych sektorów 100×100 (szacunkowo 1 990 000 pól do odczytu). To tylko plan, nie test live. Nie uruchamiaj `--all` przed pozytywnym testem małej próbki i potwierdzeniem limitów PL1.

## Dane i ograniczenia

Pierwsze uruchomienie zapisuje wyłącznie ostatnie surowe, zweryfikowane obserwacje w prywatnym pliku `~/.cache/empirenew/barony-pl1-state.json` (zmiana przez `BARONY_STATE_FILE`). Plik nie trafia do repozytorium ani GitHub Pages.

Kolejne uruchomienia mogą pokazać **kandydackie sygnały** zmiany `attackCount` lub rozpoczęcia cooldownu konkretnej fortecy. Sygnały są oznaczone jako niezweryfikowane live i nie są zapisywane jako potwierdzone ataki. Czas jest przedziałem między próbkami, nie dokładnym `attacked_at`. Skrypt nie ustala nicku atakującego.

Brak wiersza, błąd zapytania lub niezgodny typ/właściciel nie tworzy zdarzenia. Katalog IT1 służy wyłącznie do wyboru współrzędnych; cooldown i historia IT1 nie są używane.
