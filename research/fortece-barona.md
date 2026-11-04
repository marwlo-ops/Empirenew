# Fortecę baronów — mapa krain

## Jak rozpoznawać obiekty

Dokumentacja EmpireCore identyfikuje zwykły zamek barona jako obszar mapy `DUNGEON` (typ 2). Właściciel NPC ma identyfikator `ROBBER_BARON` (-202); rodzina identyfikatorów baronów obejmuje także kolejne wartości od -202 w dół.

Skan mapy królestwa można wykonać metodą `client.map.scan_kingdom(kingdom, item_types=[MapItemType.DUNGEON])`. Wynik zawiera współrzędne obiektów i właścicieli. Należy sprawdzać `failed_chunks`, ponieważ niepełny skan nie oznacza pustej mapy.

W enumach biblioteki rozróżniono identyfikatory właścicieli NPC: zwykli baronowie zaczynają się od `-202` (zakres kolejnych 13 ID), a osobne identyfikatory krainowych dungeonów to `DESERT_DUNGEON = -220`, `ICE_DUNGEON = -221` i `VOLCANO_DUNGEON = -222`. Trzeba filtrować zarówno typ obiektu mapy, jak i właściciela NPC; nie wolno utożsamiać każdego obiektu `DUNGEON` z fortecą barona.

## Kody krain

| Kraina | Kod API | Nazwa w grze |
|---|---:|---|
| Wielkie Cesarstwo | 0 | GREEN |
| Płonące Piaski | 1 | SANDS |
| Wieczny Lód / Zimowa Kraina | 2 | ICE |
| Ogniste Szczyty | 3 | FIRE |

## Fortecę baronów — status danych

Mechanizm pozwala odczytać lokalizacje fortec baronów w każdej z powyższych krain, ale w tym opracowaniu nie zapisujemy jeszcze współrzędnych. Wymagają one rzeczywistego skanu mapy na aktywnej sesji gry. Publiczny przekaźnik `empire-api.fly.dev` nie został potwierdzony jako endpoint do pełnego skanowania krain.

Po uzyskaniu wyników skanu należy zapisać dla każdej fortecy: krainę, x, y, identyfikator obiektu, identyfikator właściciela NPC i datę odczytu.

## Źródła

- EmpireCore — map scanning: https://eschnitzler.github.io/EmpireCore/guides/map-scanning/
- EmpireCore — enumy krain, typów mapy i właścicieli NPC: https://raw.githubusercontent.com/eschnitzler/EmpireCore/master/src/empire_core/enums/map.py
- GoodGame Empire Wiki — Kingdoms: https://goodgameempire.fandom.com/wiki/Kingdoms
