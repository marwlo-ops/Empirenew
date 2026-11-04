# Empirenew

Repetytorium Goodgame Empire — mapa świata, lokalizacje graczy, sojusze i dane serwera.

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
