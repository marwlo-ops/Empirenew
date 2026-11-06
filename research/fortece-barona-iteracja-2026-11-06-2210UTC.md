# Empirenew — raport iteracji fortec IT1 / PL1

**6 listopada 2026 r. — po 19:08 UTC**

## Wyniki

- Aktualny katalog z GGE Tracker IT1: snapshot z 19:04:51 UTC.
- 2021 fortec: Piaski 671, Lód 779, Ogień 571.
- 2021 unikalnych ID i współrzędnych; dokładnie siedem pól na rekord; brak cooldownu, gotowości, graczy i historii ataków.
- Probe 42276592655: Node 60/60, Python importer 19/19, fallback/redaction 8/8; test mobilny i walidacja katalogu PASS.
- Publiczny GGE Tracker PL1: wszystkie 2021 lokacje source_unavailable; snapshot nie został zmieniony przez fallback.
- Publiczny bridge: /status połączony; GAA pominięte bez bezpiecznego mapowania; GAM zwrócił 0 ruchów w widocznej sesji.
- PR #34 scalony jako 5589ea733c87ae1ec96f4bed0e4cfefe6afb1463. Custom bridge jest ograniczony do read-only gaa/fnm/gam i jednego socketu produkcyjnego PL1. Workflow 42276987737: 17/17 PASS i patch upstream/składnia PASS.
- README skorygowany — katalog nie jest pusty.

## Ograniczenia

- Custom bridge nie jest wdrożoną usługą: brak forka upstream, Render i sekretów.
- Nie ma lokalnego, autoryzowanego logowania konta demo.
- GAM nie jest globalnym rejestrem; w tej próbce zwrócił 0 ruchów.
- Dokładny czas ataku pozostaje nieustalony.
- 0 nowych potwierdzonych ataków PL1; nie zapisano żadnych fikcyjnych zdarzeń.
- Mobilność sprawdzona automatycznie w CI, nie na fizycznym telefonie.
- Nie potwierdzono Pages deployment dla snapshotu 19:04:51 ani merge commitu 5589ea7; ostatni potwierdzony deployment w dzienniku dotyczy wcześniejszego commitu 1895ade5.

## Następny krok

Lokalny, autoryzowany test na produkcyjnym PL1:

    node scripts/barony-live/probe.mjs --movements --reports --no-state

Poświadczenia pozostają lokalne. Korelować świeży rekord fortecy typu 11 z GAM/SNE/BLS/BLM po KID/X/Y i identyfikatorze gracza. Do czasu niezależnego potwierdzenia czasu bitwy zachować wyłącznie przedział obserwacji.

Zakres: fortecy IT1/PL1 i pakiet mostu Barony. Bez zmian w Mapa, Szpiegowanie i Dodatkowe.
