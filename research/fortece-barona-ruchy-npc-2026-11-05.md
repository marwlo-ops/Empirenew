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


## Nowe ustalenie: jawne żądanie GAM — 2026-11-05 21:18 UTC

### Niezależny klient potwierdza żądanie snapshotu

W publicznym repozytorium `danadum/pygge` znaleziono `Movements.get_movements()`:
- wysyła `send_json_command("gam", {})`;
- w trybie synchronicznym czeka na odpowiedzi `gam` z `count=-1`;
- scala kolejne `M` i `O`;
- deduplikuje ruchy po `M.MID` i rekordy owner info po `OID`.

Źródła:
- https://github.com/danadum/pygge/blob/f0ed456bd7b522f3f33b4f14fbb4856aa54ced64/pygge/map/movements.py
- https://github.com/danadum/pygge/blob/f0ed456bd7b522f3f33b4f14fbb4856aa54ced64/pygge/base_gge_socket.py

W `BaseGgeSocket.wait_for_json_response` `count=-1` oznacza: czekaj na pierwszą odpowiedź do 5 sekund, a następnie zbieraj kolejne odpowiedzi, dopóki nie nastąpi 100 ms ciszy. To potwierdza, że `GAM` może zwrócić kilka batchy.

### Zastosowanie w Empirenew

W #barony probe używa teraz standardowego, read-only żądania:
`client.socketManager.sendCommand('gam', {})`.

- Hook `MovementManager._add_or_update` jest filtrowany po stosie `commands/gam.js`.
- Batch przed żądaniem i batch odpowiedzi po żądaniu są rozróżniane.
- Odpowiedzi wieloczęściowe są zbierane do 250 ms ciszy (z ograniczeniem maksymalnego oczekiwania).
- Dowody są deduplikowane po `movement_id`.
- Wynik rozróżnia `gam_request_not_sent`, `gam_request_no_response`, `gam_response_collection_complete` i `gam_response_collection_incomplete`.
- Timeout nie jest interpretowany jako brak aktywnych ruchów.

To usuwa wcześniejsze ograniczenie „tylko pasywny push”. Nadal jest to snapshot ruchów zwróconych dla jednej autoryzowanej sesji/konta, nie globalny feed PL1. Ruch dowodzi armii w drodze do dokładnego KID/X/Y; czas wyjścia jest estymacją lokalną z `PT`, nie dokładnym czasem serwerowym.

### Ograniczenia live

Odczyt live z workflow 42111337522 (2026-11-05 21:18 UTC):
- GGE Tracker catalog: `E4K_PL1` ma `enabled=true`, `fortress=false`; lista wspieranych serwerów dla `/dungeons` wyklucza `E4K_PL1`.
- `/dungeons` i `/dungeons/meta` dla `E4K_PL1`: HTTP 400, Invalid server.
- `E4K_PL1_BETA`: HTTP 200, 976 fortec; wynik pozostaje wyłącznie Beta.
- trzy profile PL1 z migawki Szpiegowania: 3/3 Player not found; historia: 3/3 Invalid player ID.
- most: HTTP 200, `target_connected=false` dla `EmpirefourkingdomsExGG_3`; komendy mapy pominięte.

Workflow testowy #barony `42111337522` zakończył się SUCCESS. GitHub Pages build/deploy `42111336561` zakończył się SUCCESS. Nie uruchomiono lokalnego probe `--movements`, bo nie ma w tym środowisku autoryzowanej sesji PL1.

Nie wykonano żądania GAM do produkcyjnego PL1 i nie zapisano żadnych zdarzeń ataku. Do testu live nadal potrzebna jest działająca, autoryzowana sesja produkcyjnego PL1. Nie użyto cooldownu ani historii IT1/Beta.
