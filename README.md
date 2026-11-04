# Empirenew

Repetytorium Goodgame Empire — mapa świata, lokalizacje graczy, sojusze i dane serwera. Docelowe repozytorium zmian projektu.

## Główny moduł: mapa graczy RB
- **[Otwórz interaktywną mapę graczy RB](./mapa-rb.html)** — wyszukiwanie po nicku, wybór krainy, warstwy AP/VP, lista graczy i szczegóły wszystkich lokalizacji.
- [Dane lokalizacji RB (JSON)](data/rb-player-map.json)

## Aktualne opracowania
- [Sojusz ReBorN (RB) — dane z API](research/RB.md)
- [Fortece baronów — rozpoznawanie obiektów](research/fortece-barona.md)
- [Skanowanie fortec w trzech krainach](research/fortece-barona-skanowanie.md)
- [Dane fortec — szablon JSON](data/baron-fortresses.json)

## Zakres badania RB
- Serwer: `EmpirefourkingdomsExGG2_3`
- Sojusz: ReBorN (RB), AID `115`
- Odczyt API: 65 członków, 423 pozycje AP i 832 pozycje VP (1 255 rekordów lokalizacji).

## Zasady
- Zapisujemy datę pobrania i źródło danych.
- Rozdzielamy wartości zwrócone przez API od interpretacji.
- Nie zgadujemy znaczenia kodów królestw i typów obiektów.
- Współrzędne x/y są współrzędnymi mapy gry, nie GPS.


## Mapa sojuszy RB + MD
- ReBorN (RB, AID 115) — czerwone znaczniki i wpisy graczy.
- MADDEVILS (MD, AID 41343) — zielone znaczniki i wpisy graczy.
- Selektor umożliwia widok RB, MD lub obu sojuszy.
- Dostępne krainy: Wielkie Cesarstwo, Piaski, Lód i Ogień; nieustalony kod 4 jest ukryty.
- Kierunki osi mapy: X rośnie w prawo, Y rośnie w dół.
- Tracker baronów sortuje dostępne fortyfikacje przed oczekującymi; ponowny atak po 24 godzinach od zapisanego pokonania. Czasy zapisują się lokalnie w przeglądarce.
- Katalog współrzędnych fortec jest obecnie pusty. Publiczny przekaźnik API nie potwierdził zgodnego skanowania mapy E4K; nie wpisujemy fikcyjnych lokalizacji.


## Wspólna historia lokalizacji (RB + MD)

Historia zmian lokalizacji jest przechowywana centralnie w katalogu `data/`, a nie wyłącznie w pamięci przeglądarki:

- `data/location-snapshots.json` — ostatni poprawny snapshot sojuszy.
- `data/location-history.json` — zdarzenia dotyczące zamków.
- `data/outpost-history.json` — zdarzenia dotyczące posterunków.
- `scripts/location-tracker.js` — odczyt potwierdzonej komendy `ain`, walidacja, porównanie i dopisywanie zdarzeń.
- `.github/workflows/tracker.yml` — harmonogram GitHub Actions co 15 minut oraz uruchomienie ręczne.

Pierwszy snapshot w repozytorium został utworzony na podstawie aktualnych plików mapy (RB AID 115, MD AID 41343). Nie generuje on zdarzeń historycznych wstecz. Pierwsze uruchomienie trackera porównuje bieżące dane API z tym punktem odniesienia.

**Fail-safe:** błąd HTTP/JSON, nieznana lista członków, zbyt mała liczba graczy lub podejrzany spadek liczby lokalizacji kończy zadanie błędem. W takim przypadku snapshot i historia nie są zapisywane. Zmiana liczby posterunków nie jest automatycznie klasyfikowana jako przeniesienie; przeniesienie jest rozpoznawane tylko przy tej samej liczbie obiektów danego gracza, krainy i typu.

Widok `mapa-rb.html` pobiera wspólne pliki historii i oferuje filtry nicku, sojuszu, krainy, rodzaju obiektu i rodzaju zdarzenia. Lokalna historia w `localStorage` pozostaje osobnym, pomocniczym archiwum.
