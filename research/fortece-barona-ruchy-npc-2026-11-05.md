# Odczyt ruchów atakujących fortece NPC — 2026-11-05

## Potwierdzone w kodzie klienta E4K

Źródło: ggejs MovementParser.

- `movement.M.T === 11` jest mapowane na `ArmyAttackMovement` i opisane jako `MOVEMENTTYPE_NPC_ATTACK`.
- `BasicMovement` dekoduje `MID`, `PT`, `TT`, `D`, `SA`, `TA`, `SID`, `TID`, `KID`.
- `TA` jest parsowane przez `MapObjectParser`; typ obiektu `11` tworzy `BossDungeonMapobject`.
- `BossDungeonMapobject` interpretuje `data[7]` jako `kingdomId`.
- `BasicMovement` wylicza czas odjazdu jako `Date.now() - PT * 1000`, a przyjazdu jako `Date.now() + (TT - PT) * 1000`.
- `SID` jest używane do rozpoznania właściciela obszaru źródłowego, a `TID` właściciela celu.

Źródła:
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/utils/MovementParser.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/movements/BasicMovement.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/movements/ArmyAttackMovement.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/utils/MapObjectParser.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/mapobjects/BossDungeonMapobject.js

## Kryteria dowodu w probe PL1

Nowy ekstraktor przyjmuje ruch tylko wtedy, gdy jednocześnie:
1. `T === 11` (atak NPC),
2. `D === 0` (ruch wychodzący według semantyki klienta),
3. `TA[0] === 11` (cel jest BossDungeonMapobject),
4. `TA[7] === KID` (kraina celu zgadza się z ruchem),
5. `TID` jest oczekiwanym właścicielem NPC dla danej krainy (`-230/-231/-232`),
6. `SID` i `MID` są dodatnimi identyfikatorami,
7. `PT` oraz `TT` opisują nadal trwającą podróż (`0 <= PT < TT`).

Wynik zawiera KID, X/Y, właściciela NPC, ID atakującego, ID ruchu, pozycję źródłową oraz szacowany czas wyjścia i przybycia. ID katalogowe jest tylko odwołaniem do katalogu współrzędnych IT1, którego zgodność siatki z PL1 potwierdził operator; nie jest źródłem statusu ruchu.

## Ograniczenia

- `PT` jest liczbą sekund od rozpoczęcia ruchu, a czas wyjścia wyliczany jest względem lokalnego czasu próbki. `movement_departure_estimate_utc` jest więc estymacją, nie dokładnym timestampem nadanym przez serwer.
- `GAM` zwraca ruchy widoczne dla użytej sesji/mostu. Nie dowodzi globalnej kompletności ruchów wszystkich graczy PL1.
- Ruch potwierdza atak w drodze do celu, ale nie dowodzi, że atak dotarł i zakończył walkę. Do tego potrzebny jest raport walki lub osobne potwierdzenie zakończenia.
- Nie używa się cooldownu ani historii IT1/Beta do wnioskowania o PL1.
- Nie zapisuje się wyników z testów syntetycznych jako realnych zdarzeń.

## Status live

W tym commicie nie ma autoryzowanej, potwierdzonej sesji mostu PL1. Nowy ekstraktor jest sprawdzany testami syntetycznymi i zostanie użyty przez istniejący odczyt `GAM` tylko wtedy, gdy status mostu potwierdzi połączenie z `EmpirefourkingdomsExGG_3`.
