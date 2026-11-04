# Adapter API E4K — Empirenew

## Wynik rozpoznania

W repozytorium `ggempire` istnieje wcześniejszy kolektor PL1, który dokumentuje konkretne kształty dwóch żądań do publicznego przekaźnika `empire-api.fly.dev`. To punkt wyjścia do adaptera, ale sam kod kolektora nie jest dowodem bieżącej dostępności usługi.

| Komenda | Żądanie | Co można pobrać | Status kontraktu |
|---|---|---|---|
| `ain` | `/{server}/ain/%22AID%22:{aid}` | sojusz, członkowie, AP/VP | potwierdzony wcześniej na PL1 |
| `hgh` | `/{server}/hgh/{JSON}`, parametry `LT=11,LID=1,SV=5` | ranking sojuszy | kształt żądania zapisany w kolektorze; odpowiedź wymaga walidacji |
| `gdi` | brak potwierdzonego kontraktu | profil gracza — hipoteza | nie używać |
| `llsp` | brak potwierdzonego kontraktu | nieustalone | nie używać |
| `llsw` | brak potwierdzonego kontraktu | nieustalone | nie używać |
| `slse` | brak potwierdzonego kontraktu | nieustalone | nie używać |

## Adapter

Plik [`api/e4k-client.js`](../api/e4k-client.js) zawiera:
- `fetchAlliance(aid)` — odczyt `ain`, walidację `return_code`, normalizację członków oraz pozycji AP/VP;
- `fetchAllianceRanking(start)` — odczyt jednej strony rankingu `hgh`, zachowanie surowych wierszy;
- `testReadOnlyApi()` — test dwóch kontraktów i jawny raport błędów.

Adapter jest tylko do odczytu. Nie wysyła haseł, tokenów, cookies ani innych danych sesji. Nie wykonuje skanowania mapy.

## Ograniczenia i bezpieczeństwo

- Publiczny przekaźnik może zmienić dostępność, limity, CORS lub format odpowiedzi. Przed włączeniem odświeżania w interfejsie trzeba wykonać test z przeglądarki GitHub Pages.
- Nie zapisujemy pustej lub częściowej odpowiedzi jako nowego poprawnego snapshotu.
- Nie zakładamy, że komendy z desktopowego EmpireCore działają w mobilnym E4K.
- Nie przypisujemy znaczenia nieznanym komendom na podstawie samych skrótów.
- Nie wpisujemy lokalizacji fortec baronów, dopóki nie ma potwierdzonego źródła współrzędnych.

## Następne kroki techniczne

1. Uruchomić `testReadOnlyApi()` w przeglądarce na stronie Empirenew i zapisać rzeczywisty wynik.
2. Jeśli `ain` przejdzie test CORS, podłączyć odświeżanie RB/MD z bezpiecznym fallbackiem do ostatniego snapshotu.
3. Rozpoznać `hgh` na podstawie surowej odpowiedzi, a dopiero potem normalizować pola rankingu.
4. Dla `gdi`, `llsp`, `llsw`, `slse` pozyskać definicje backendu lub przeprowadzić kontrolowane testy parametrów. Do tego czasu pozostają wyłączone.
5. Dla fortec potrzebny jest osobny, zgodny z mobilnym E4K skaner mapy. Sam `ain` nie dostarcza pełnej mapy świata.

## Źródło wcześniejszej implementacji

- [Kolektor PL1 w repozytorium ggempire](https://github.com/marwlo-ops/ggempire/blob/main/scripts/fetch_reborn.py)
- [Skaner rankingów i rosterów PL1](https://github.com/marwlo-ops/ggempire/blob/main/scripts/scan_pl1.py)
