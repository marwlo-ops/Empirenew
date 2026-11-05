# Fortecy i historia ataków — dziennik potwierdzonych testów

Ostatnia aktualizacja: 2026-11-05. Dane w tym dokumencie rozdzielają potwierdzone wyniki od hipotez i nierozwiązanych problemów.

## 1. Katalog mapy IT1

- Źródło: publiczne API GGE Tracker, `GET /api/v1/dungeons`, nagłówek `gge-server: IT1`.
- Odczyt na głównej gałęzi: 2026-11-05 14:00:35 UTC; ponowny odczyt w gałęzi PR: 2026-11-05 14:20:35 UTC.
- Wynik importera: strona 1/1, 2021 rekordów.
- Krainy: Piaski 671, Lód 779, Ogień 571.
- Walidacja opublikowanego JSON: 2021 rekordów, 0 duplikatów współrzędnych, 0 niepoprawnych współrzędnych.
- Każdy rekord zawiera wyłącznie identyfikator, KID, krainę, X/Y, typ i źródło IT1. Nie zawiera danych gracza, czasu ataku, cooldownu ani gotowości.
- Wszystkie rekordy są oznaczone jako źródło IT1. Operator potwierdził zgodność siatki współrzędnych IT1 i produkcyjnego PL1; sam import nie potwierdza jednak aktualnej obecności każdego obiektu ani stanu ataków na PL1.

## 2. Zgodność GGE Tracker z E4K PL1

Odczyty z workflow diagnostycznego z 2026-11-05 14:00 UTC:

| Nagłówek serwera | HTTP | Potwierdzony wynik |
|---|---:|---|
| `IT1` | 200 | API zwróciło rekordy mapy; użyte do importu |
| `EmpirefourkingdomsExGG2_3` | 400 | Nieprawidłowa nazwa serwera dla GGE Tracker |
| `E4K_PL1` | 400 | Nieobsługiwany serwer produkcyjny |
| `E4K_PL1_BETA` | 200 | 976 stron przy próbce size=1; zwraca pola historii, ale to nie produkcyjny PL1 i nie jest importowany |
| `PL1` | 400 | Nieobsługiwana nazwa serwera |

Treść błędu dla `E4K_PL1` wymienia obsługiwane serwery i zawiera `E4K_PL1_BETA`, ale nie produkcyjne `E4K_PL1`. Endpoint `/servers` zwraca 63 pozycje, w tym dokładne wpisy `E4K_PL1` i `E4K_PL1_BETA`; nie jest to jednak allowlista endpointu `/dungeons`, który nadal odrzuca produkcyjny nagłówek HTTP 400. BETA nie jest zamiennikiem produkcyjnego serwera i nie została użyta do importu.

Przykładowy rekord odpowiedzi IT1 zawierał także pola `player_id`, `player_name`, `last_attack`, `available_duration_seconds`, `global_available_at` i `effective_cooldown_until`. Importer odrzuca je i zapisuje tylko współrzędne. Nie oznacza to dostępności tych pól dla PL1.

Kod publicznego API GGE Tracker opisuje również endpoint historii gracza `/dungeons/player/{playerId}`, który zwraca KID, X/Y i `attacked_at`. Jest to historia filtrowana po graczu, a nie potwierdzona kompletna historia każdego punktu PL1. Serwer produkcyjny PL1 nie przeszedł testu obsługi w tym API.

## 3. Most `empire-api.fly.dev` — inspekcja źródła

Zbadany publiczny upstream `danadum/empire-api`:

- Trasa: `/:server/:command/:headers`.
- Jawnie zmapowane komendy: `wsp`, `gdi`, `hgh`, `ain`, `llsp`, `llsw`, `slse`.
- Brak jawnego mapowania `gaa` i `fnm`.
- Dla nieznanej komendy upstream ustawia wzorzec odpowiedzi na cały zestaw nagłówków żądania.
- Timeout oczekiwania na odpowiedź wynosi 1000 ms.

Dokumentacja protokołu EmpireCore potwierdza:
- `gaa`: `KID`, `AX1`, `AY1`, `AX2`, `AY2`; odpowiedź mapy może zawierać `AI`, `OI`, `uap`.
- `fnm`: `T`, `KID`, `LMIN`, `LMAX`, `NID`; odpowiedź zawiera obszar mapy pod `gaa`.

Fork mostu GGE Tracker ma jawny wpis `gaa: { KID: "KID" }`, co potwierdza, że odpowiedź GAA należy dopasowywać po KID, a nie po wszystkich polach żądania. To jest wskazówka do poprawki własnego mostu; nie jest dowodem, że aktualny most publiczny obsługuje GAA/FNM.

## 4. Live test publicznego mostu PL1

Testy wykonane 2026-11-05 14:09:35–14:09:39 UTC oraz powtórzone 14:16:46–14:16:50 UTC; wyniki obu prób były identyczne:

- `GET https://empire-api.fly.dev/status` — HTTP 200; serwer `EmpirefourkingdomsExGG2_3` zgłosił `connected=true`.
- `gaa` dla KID=1 i prostokąta X/Y 0–1 — HTTP 400, `Invalid command or headers`.
- `fnm` dla T=2, KID=1, LMIN=1, LMAX=1, NID=-202 — HTTP 400, `Invalid command or headers`.
- Zapytania były read-only; żadne dane mapy ani historii nie zostały zapisane.

Wniosek: most jest osiągalny i ma aktywny socket PL1, ale jego aktualna obsługa komend mapy nie przechodzi testu. To jest potwierdzony błąd, a nie brak połączenia.

## 5. Build i publikacja

- Import mapy IT1 na main: workflow zakończony sukcesem, 2021 rekordów, commit `11e3910`.
- Ponowny import w gałęzi PR: workflow `42044039367` zakończony sukcesem; test UI PASS, importer zwrócił 2021 rekordów i zapisał snapshot z 14:20:35 UTC w commicie `c9aaa9b`. Snapshot czeka na scaleniu PR.
- Diagnostyka PL1: workflow `42044033255` zakończony sukcesem jako uruchomienie skryptu; powtórzone testy `/dungeons` dla produkcyjnego PL1 oraz komendy mostu nadal zwróciły HTTP 400. Sukces workflow oznacza poprawne wykonanie diagnostyki, nie obsługę API.
- GitHub Pages: build i deploy dla aktualnego main commitu `0502e9f` zakończone sukcesem o 14:16 UTC. Zmiany z PR nie są jeszcze na stronie; wymagają scalenia i kolejnego deployu.


## 6. Oddzielne sygnały aktywności serwera PL1

Na głównej gałęzi jest dodatkowy plik `data/server-intel-history.json` używany przez panel sygnałów aktywności w Barony. W odczycie z 2026-11-05 13:04:05 UTC zawierał 3083 profile i 9241 zdarzeń (m.in. zmiany potęgi i honoru), ale **0 zdarzeń z X/Y celu**. Sygnały mogą wskazać aktywność gracza między snapshotami, lecz nie identyfikują fortecy, którą zaatakował. Panel pozostaje oddzielny od rejestru fortec i nie uruchamia blokady 24 h.

## 7. Mobilność i poprawność UI

Wprowadzone poprawki:
- statystyka opisuje liczbę wpisów lokalnych, a nie „zweryfikowane” punkty PL1;
- filtr i sortowanie używają etykiet wpisów lokalnych;
- wpisy ręczne są wyraźnie oznaczone;
- przyciski, pola i selektory otrzymują minimalną wysokość 44 px;
- dodano widoczny focus dla obsługi klawiaturą.

Test statyczny w CI `42044039367` sprawdził viewport, breakpoint mobilny, minimalny rozmiar dotykowy, focus, etykiety źródła i zachowanie panelu sygnałów — PASS. Zachowuje też istniejący panel sygnałów PL1, ale nie interpretuje go jako historii ataków na konkretne punkty. Nie zastępuje to testu na fizycznym telefonie.

## 8. Co nadal blokuje automatyczną historię ataków PL1

1. GGE Tracker nie obsługuje produkcyjnego `E4K_PL1` w przetestowanym endpointcie.
2. Publiczny most ma połączony socket PL1, ale live test GAA i FNM zwrócił HTTP 400. Upstream ma niedopasowany matcher i krótki timeout.
3. Sama odpowiedź GAA dostarcza obszar mapy, ale nie dowodzi historii ataków. Do „kto i kiedy” potrzebny jest wiarygodny feed historii albo obserwowany, udokumentowany strumień zdarzeń.
4. Nie ma potwierdzonego automatycznego źródła per lokalizacja dla E4K PL1.

## 9. Następny krok

Przygotować i przetestować własny most z matcherem GAA po KID, matcherem FNM po odpowiedzi zawierającej X/Y/gaa i dłuższym timeoutem. Następnie uruchomić ten sam test read-only na produkcyjnym PL1. Dopiero po poprawnym odczycie mapy badać, czy istnieje źródło zdarzeń ataku; GAA/FNM same nie dostarczają potwierdzonej historii. Nie publikować danych z BETA jako PL1 i nie dopisywać fikcyjnych zdarzeń.

## 10. Ponowna weryfikacja GGE Tracker — 2026-11-05 14:52 UTC

Dwa bezpieczne rozszerzenia skryptu diagnostycznego zostały opublikowane na main:
- f070b8f — historia Beta pobierana po rzeczywistych player_id odczytanych z rekordów dungeonów, zamiast po arbitralnych graczach z rankingu;
- bb87ba6 — osobny test produkcyjnego E4K_PL1 na podstawie identyfikatorów/nicków z migawki Szpiegowania.

Wyniki workflow 42049184844 (uruchomienie skryptu zakończone sukcesem):

| Test | Wynik | Znaczenie |
|---|---:|---|
| /servers | HTTP 200, 63 wpisy | Lista zawiera oba identyfikatory PL1 i PL1 Beta |
| /servers/catalog — E4K_PL1 | enabled=true, fortress=false | Produkcyjny PL1 nie ma w tym scraperze włączonego modułu fortec |
| /servers/catalog — E4K_PL1_BETA | enabled=true, fortress=true | Osobny serwer Beta ma włączony moduł fortec |
| /dungeons i /dungeons/meta — E4K_PL1 | HTTP 400, Invalid server | Brak produkcyjnej historii fortec w tym API |
| /dungeons — E4K_PL1_BETA | HTTP 200, 976 rekordów | Dane wyłącznie Beta |
| /dungeons — IT1 | HTTP 200, 2021 rekordów | Dane wyłącznie mapy IT1 |
| Beta ↔ IT1 | 976/976 współrzędnych zgodnych | Piaski 312/312, Lód 409/409, Ogień 255/255; zgodność mapy nie przenosi historii Beta na PL1 |
| /dungeons/player/{id} — Beta | 5/5 historii niepustych; 8806 rekordów, 8806 zgodnych z katalogiem IT1 | Endpoint historii działa dla rzeczywistych ID atakujących z rekordów Beta |
| /players/{name} — produkcyjny PL1 | 3/3: HTTP 200, Player not found | API nie rozpoznaje próbkowanych graczy z migawki PL1 |
| /dungeons/player/{member_id} — produkcyjny PL1 | 3/3: HTTP 400, Invalid player ID | Brak historii produkcyjnego PL1; nie zapisano żadnego zdarzenia |
| Most empire-api.fly.dev/status | HTTP 200, socket EmpirefourkingdomsExGG2_3=false | GAA/GAM pominięte, bo nie było potwierdzonej sesji |

Wynik 5/5 historii Beta wyjaśnia wcześniejszy test z zerową liczbą wpisów: poprzednio użyto przypadkowych graczy rankingowych i pominięto nagłówek serwera. Poprawiony test bierze ID bezpośrednio z rekordów dungeonów i wysyła gge-server: E4K_PL1_BETA. To poprawia diagnostykę endpointu, ale nie daje żadnego dowodu ataku na produkcyjnym PL1. Nie kopiujemy rekordów Beta ani cooldownów IT1 do historii PL1.

## 11. Alternatywna ścieżka: odczyt mapy z autoryzowanej sesji PL1

Dokumentacja i kod publicznej biblioteki EmpireCore wskazują bardziej obiecujący odczyt per lokalizacja niż publiczny scraper:
- client.map.scan_kingdom(..., item_types=[MapItemType.DUNGEON]) zwraca obiekty mapy oraz failed_chunks; częściowy skan musi być oznaczony jako niekompletny.
- client.map.scan_around(x, y, radius, kingdom, ...) odczytuje obiekty w promieniu do 50 pól jednym żądaniem i zachowuje obiekty NPC.
- MapAreaItem.attack_cooldown_seconds jest opisane jako liczba sekund do ponownej możliwości ataku; wartość ujemna oznacza, że blokada minęła. owner_id pozwala odróżnić obiekty NPC od obiektów graczy.
- client.movements.get_movements() i zdarzenia ruchu dotyczą ruchów widocznych dla zalogowanego konta. Callbacki ataków obejmują konto/sojusz, a dokumentacja wyłącza ataki na obiekty typu robber baron/dungeon z części powiadomień sojuszowych.
- Skrzynka client.messages.mailbox zawiera raporty bitew dotyczące ataków na konto lub wykonanych przez konto; nie jest to globalna historia całego serwera.

Źródła:
- https://eschnitzler.github.io/EmpireCore/guides/map-scanning/
- https://eschnitzler.github.io/EmpireCore/guides/movements/
- https://eschnitzler.github.io/EmpireCore/guides/messages/
- https://github.com/eschnitzler/EmpireCore/blob/01800fa1033a4413b51f5dfe2c3e3d1a3fdcdca7/src/empire_core/map/models/items.py

Ograniczenia i warunki testu:
1. To jest kandydat do testu, a nie działające źródło potwierdzone na PL1. Biblioteka jest w fazie alpha i wymaga legalnej, autoryzowanej sesji gry.
2. Sam cooldown mapy może potwierdzić stan konkretnej fortecy w chwili odczytu, ale nie zawiera automatycznie nicku atakującego ani serwerowego czasu rozpoczęcia ataku.
3. Czas ataku można byłoby ograniczyć do przedziału pomiędzy próbkami; wyliczanie go z pozostałego cooldownu wymaga wcześniejszego potwierdzenia pełnej długości cooldownu na produkcyjnym PL1. Nie zakładamy 24 h bez pomiaru.
4. Połączenie musi być wykonane lokalnie lub w zabezpieczonym środowisku operatora. Nie umieszczamy loginu, hasła ani tokenów w repozytorium, GitHub Actions ani plikach publikowanych na Pages.

Następny test: na autoryzowanej sesji produkcyjnego PL1 wykonać wyłącznie odczyt kilku znanych współrzędnych w każdej krainie i zapisać surowy rekord mapy, kid/x/y, owner_id, attack_cooldown_seconds, czas próbki i status kompletności. Dopiero po pozytywnym wyniku tego testu projektować poller. Do tego czasu automatyczna historia ataków PL1 pozostaje niepotwierdzona.

## 12. Przygotowany lokalny test mapy PL1 — 2026-11-05 14:58 UTC

Nowy przegląd dokumentacji EmpireCore 0.63.0 potwierdza, że autoryzowana sesja gry ma osobny, read-only odczyt mapy:
- `client.map.scan_around(x, y, radius, kingdom)` zwraca wiersze mapy w zadanym promieniu; dla promienia 1 jest to mały odczyt wokół jednej współrzędnej.
- `MapAreaItem` może zawierać `owner_id`, `dungeon_level`, `attack_cooldown_seconds`, `total_cooldown_seconds`, `victory_count`, `defeater_player_id` i `is_defeated`.
- Dokumentacja definiuje `defeater_player_id` jako identyfikator gracza, który pokonał **boss dungeon**. Nie rozszerzamy tego znaczenia automatycznie na zwykłe fortece/baronów.
- `attack_cooldown_seconds` to pozostały czas do ponownego ataku, a nie znacznik czasu ostatniego ataku.
- Callbacki ruchów/ataków nie obejmują zwykłych właścicieli typu dungeon/robber baron; nie będą więc globalnym źródłem historii tych celów.

Wprowadzone zmiany w repozytorium:
- `scripts/probe-pl1-live-map.py` — lokalny, read-only test 3 przykładowych współrzędnych na krainę (9 żądań). Ładuje wyłącznie kompletny katalog mapy IT1, odczytuje wskazane współrzędne na serwerze określonym przez `GGE_ZONE` (domyślnie `EmpirefourkingdomsExGG2_3`) i zwraca surowe, opatrzone czasem próbki JSON.
- Skrypt nie wysyła ataków ani szpiegowania, nie zapisuje plików i nie wylicza `attacked_at` z cooldownu. Identyfikator pokonującego jest rozwiązywany do nicku tylko dla rekordu typu `BOSS_DUNGEON`, gdy serwer go poda.
- Login/hasło są pobierane lokalnie z `GGE_USERNAME`/`GGE_PASSWORD` lub z bezpiecznego promptu; nie są zapisane w repozytorium ani przekazywane do GitHub Actions.
- `tests/test_probe_pl1_live_map.py` — testy offline walidacji katalogu, duplikatów, zakazanych pól, doboru próbek, braku fikcyjnego czasu ataku i ograniczenia pola defeatera do boss dungeon.
- `.github/workflows/baron-pl1-probe.yml` — dodano kontrolę składni Python i testy offline przed istniejącą diagnostyką API. Zmiana jest w commicie `ddf550e`; wynik uruchomienia nowego workflow nie został jeszcze potwierdzony w tej iteracji.

Status wykonania:
- Katalog IT1 nadal ma 2021 unikalne punkty: Piaski 671, Lód 779, Ogień 571; 0 duplikatów i 0 pól ataku/cooldown. Snapshot: 2026-11-05 14:34:36 UTC.
- Skrypt lokalny został dodany, ale **nie wykonano jeszcze testu live na PL1** — wymaga autoryzowanej sesji gry na koncie operatora. Nie należy przekazywać loginu ani hasła w czacie ani umieszczać ich w GitHub Secrets/Actions dla tego testu.
- Nawet jeśli live map zwróci cooldown, nie potwierdzi to automatycznie kto i kiedy zaatakował zwykłego barona. Do tego potrzebny jest osobny, wiarygodny dziennik zdarzeń albo porównywanie kolejnych próbek z potwierdzonym źródłem gracza i czasu. Na razie nie zapisujemy historii ataków.

Następny krok: uruchomić lokalnie `python -m pip install "empire-core==0.63.0"`, a następnie `python scripts/probe-pl1-live-map.py` na koncie zalogowanym do produkcyjnego E4K PL1. Jeśli biblioteka nie rozpozna strefy, należy zweryfikować `GGE_ZONE`, `GGE_GAME_ID` i `GGE_NETWORK_ID` na podstawie listy serwerów — skrypt kończy się błędem zamiast przełączać się na inny świat. Dopiero wynik rzeczywistej próbki zdecyduje, czy można budować poller.

## 13. Wyniki kolejnej iteracji CI i korekta konfiguracji — 2026-11-05 15:08 UTC

Dodatkowa korekta bezpieczeństwa:
- `scripts/probe-pl1-live-map.py` nie przyjmuje już domyślnych `game_id=12` i `network_id=1`. Te identyfikatory nie zostały potwierdzone dla E4K PL1, więc skrypt wymaga jawnego `--game-id` i `--network-id` albo zmiennych `GGE_GAME_ID` i `GGE_NETWORK_ID`. W razie braku/niezgodności kończy się bez logowania i bez przełączania na inny serwer.
- EmpireCore 0.63.0 jest dokumentowane przede wszystkim jako klient Goodgame Empire; zgodność z E4K PL1 nie została potwierdzona. Lokalny skrypt jest przygotowanym testem kandydującym, nie dowodem działającego połączenia PL1.

Wyniki workflow `42051704644` dla commitu `0179ec3`:
- `py_compile` — PASS.
- 10 testów offline `test_probe_pl1_live_map.py` — PASS.
- Test mobilny `scripts/test-barony-mobile.mjs` — PASS: viewport, breakpoint, minimalne cele dotykowe 44 px, focus, etykiety lokalnej historii i separacja sygnałów od historii ataków.
- Diagnostyka publicznego API zakończyła się poprawnie jako test, ale nie potwierdziła produkcyjnej historii PL1:
  - `/servers`: HTTP 200, 63 wpisy, identyfikatory E4K_PL1 i E4K_PL1_BETA obecne.
  - `/servers/catalog`: produkcyjny E4K_PL1 ma `enabled=true`, ale `fortress=false`; Beta ma `fortress=true`.
  - `/dungeons`: E4K_PL1 HTTP 400 `Invalid server`; Beta HTTP 200; IT1 HTTP 200.
  - Zgodność współrzędnych Beta ↔ IT1: 976/976 (Piaski 312/312, Lód 409/409, Ogień 255/255). To nadal nie jest dowód równoważności historii produkcyjnego PL1.
  - Historia Beta: 5/5 próbek niepustych, 8418 rekordów, wszystkie dopasowane do współrzędnych źródłowych dungeonów — wyłącznie diagnostyka Beta.
  - Historia produkcyjnego PL1: 3/3 próbkowanych identyfikatorów z migawki Szpiegowania nie zostały rozpoznane (`Player not found`); zapytania historii zwróciły HTTP 400 `Invalid player ID`.
  - `empire-api.fly.dev/status`: HTTP 200, ale `target_connected=false` dla `EmpirefourkingdomsExGG2_3`; komendy mapy zostały prawidłowo pominięte, bez wysyłania ich do niepotwierdzonej sesji.
- GitHub Pages dla commitu `1e5e5e7`: build i deploy zakończone sukcesem (workflow `42051528473`). Dla najnowszego commitu `0179ec3` build Pages zakończył się sukcesem; krok deploy był jeszcze w toku podczas tego zapisu.
- Test mobilny jest statycznym testem DOM/CSS/JS; fizyczny telefon nie był dostępny do testu ręcznego.

Wniosek tej iteracji: katalog IT1 jest poprawny i gotowy do publikacji jako mapa współrzędnych; automatyczna historia ataków na produkcyjnym PL1 nadal nie ma wiarygodnego źródła. Nie skopiowano żadnych danych Beta/IT1 do historii PL1 i nie utworzono zdarzeń ataku.

## 14. Walidator katalogu, odświeżenie IT1 i publikacja — 2026-11-05 15:13 UTC

Dodano `scripts/test-baron-map-catalog.mjs` i podłączono go do obu workflow fortec:
- sprawdza kompletność katalogu i poprawny czas pobrania;
- wymaga źródła GGE Tracker IT1, zgodnego KID/krainy, typu `dungeon` i zakresu współrzędnych 0–1286;
- wykrywa duplikaty oraz odrzuca pola ataku, cooldownu, gracza i gotowości;
- uruchamia się po imporcie, a także w diagnostyce PL1.

Odświeżenie danych:
- workflow `42052431277` pobrał ponownie 1/1 stronę GGE Tracker IT1 i zapisał 2021 rekordów;
- walidator po imporcie: PASS — 2021 unikalnych współrzędnych, bez pól ataku/cooldown/gracza/gotowości;
- nowy snapshot: `2026-11-05T15:11:37.173Z`;
- porównanie starego snapshotu z nowym: 2021/2021 współrzędnych identycznych, 0 dodanych, 0 usuniętych. Zmienił się czas pobrania, nie pozycje fortec.

Obsłużony błąd wdrożeniowy:
- pierwsza próba importu `42052340772` przeszła pobranie i walidację, ale push został odrzucony przez non-fast-forward, ponieważ w tym samym czasie pojawiły się inne commity;
- poprawiono krok publikacji w `.github/workflows/baron-map-import.yml`: przed push wykonuje teraz `git fetch` i `git rebase` na aktualny branch;
- ponowny workflow `42052431277` zakończył się sukcesem i wypchnął commit danych `11f92ee`.

Końcowa kontrola:
- workflow PL1 `42052367160`: PASS — 12 testów offline, test mobilny i walidator aktualnego katalogu;
- test mobilny potwierdził viewport, cele dotykowe 44 px, focus i rozdzielenie lokalnych wpisów od potwierdzonej historii;
- workflow GitHub Pages `42052460959` dla commitu `11f92ee`: build i deploy PASS; środowisko Pages zgłosiło sukces;
- ostatni live test publicznego API nadal wykazuje `E4K_PL1 fortress=false`, `/dungeons` HTTP 400 oraz `target_connected=false` w publicznym moście. Żaden rekord Beta/IT1 nie został przeniesiony do historii PL1.

Aktualny stan: mapa IT1 jest świeżo pobrana, zweryfikowana i opublikowana; automatyczna historia „kto i kiedy zaatakował” dla produkcyjnego PL1 pozostaje niepotwierdzona. Lokalny skrypt testowy nadal wymaga potwierdzenia obsługi E4K przez EmpireCore, poprawnych identyfikatorów game/network oraz uruchomienia przez operatora w autoryzowanej sesji. Nie zapisano żadnych fikcyjnych ataków.

Dodatkowy błąd testów i poprawka:
- po zaostrzeniu walidacji KID/krainy/źródła/typu pierwsze uruchomienie `42052101151` zatrzymało się na teście fixture, ponieważ przykładowe rekordy testowe nie zawierały wymaganych pól `kingdom`, `source_server` i `type`;
- uzupełniono fixture oraz test duplikatów; kolejne uruchomienia `42052107856`, `42052135745` i `42052367160` zakończyły się sukcesem, w ostatnim przebiegu 12/12 testów offline PASS.


## 15. Korekta transportu i lokalny klient E4K PL1 — 2026-11-05

### Nowe, istotne rozróżnienie: klient GGE ≠ klient E4K

Poprzedni lokalny skrypt scripts/probe-pl1-live-map.py korzystał z EmpireCore. Po sprawdzeniu kodu E4K-specyficznej biblioteki ggejs uznaję tę ścieżkę za niepotwierdzoną dla produkcyjnego PL1 i skrypt został zabezpieczony tak, aby odmawiał pracy na strefach E4K przed odczytaniem poświadczeń.

Źródła i ustalenia:

- Repozytorium danych E4K E4K-data, plik network/network.json, wskazuje wpis PL1: value=3, host e4k-live-pl1-game.goodgamestudios.com, strefa EmpirefourkingdomsExGG_3, zoneId=259 i instanceLocaId=generic_country_PL.
- Pakiet npm e4k-data ma wersję 4.144.21-788.RC.3; jego wpis sieciowy podaje deployTime=1767612028, czyli 2026-01-05 11:20:28 UTC. To metadane pakietu, nie świeży test połączenia; skrypt sprawdza dokładny host i strefę i odmawia przełączenia na inny serwer.
- ggejs 2.2.0 udostępnia osobny E4KClient. W SocketManager.js transport jest wybierany jako TCP dla stref zaczynających się od EmpirefourkingdomsExGG, a WSS dla pozostałych. To wyjaśnia, dlaczego nie wolno traktować adresu WSS generowanego przez EmpireCore jako potwierdzonej konfiguracji E4K.
- Kod ggejs używa game ID 16 w integracji kont E4K. Network ID jest odczytywany z odpowiedzi core_gpi; nowy probe nie zgaduje ani nie wpisuje network ID na sztywno.
- WorldMapManager.getSector(kid, x, y) pobiera sektor 100×100 przez komendę gaa. gaa.js wysyła KID, AX1, AY1, AX2, AY2, a odpowiedź mapy jest parsowana z AI i OI.
- MapObjectParser.js kieruje typ mapy 2 do DungeonMapobject. W DungeonMapobject.js pola wiersza są mapowane jako data[4] → attackCount, data[5] → attackCooldownEnd (wyliczane jako lokalne Date.now() + data[5] * 1000), data[6] → kingdomId. WorldMapOwnerInfoData mapuje właścicieli dungeonów krain KID 1/2/3 na ID -220/-221/-222.

Wniosek techniczny: istnieje E4K-specyficzna, read-only ścieżka pobrania stanu konkretnego wiersza mapy. Wiersz może dostarczyć X/Y, KID, typ, NPC owner ID, licznik attackCount i pozostały cooldown. Nie zawiera automatycznie nicku atakującego ani dokładnego czasu rozpoczęcia ataku. Funkcje DungeonConst.getLevel(victories, KID) i getVictories() używają attackCount jako licznika zwycięstw, więc jego wzrost jest mocniejszym sygnałem niż sam cooldown; nadal oznaczamy go jako kandydacki do czasu live walidacji PL1. Biblioteka zawiera też stałą COOLDOWN=10800, ale probe jej nie używa — nie jest to pomiar cooldownu PL1. WorldMapManager opisuje getSector jako dostępny tylko dla krain, w których konto ma zamek; błąd odczytu takiej krainy nie jest dowodem braku fortec.

### Nowy lokalny probe

Dodano wyłącznie powiązane pliki modułu Barony:

- scripts/barony-live/probe.mjs — lokalny odczyt produkcyjnego PL1 przez E4KClient, tylko po ustawieniu lokalnych zmiennych E4K_USERNAME i E4K_PASSWORD.
- scripts/barony-live/probe-core.mjs i probe-core.test.mjs — walidacja katalogu IT1, grupowanie celów w sektory 100×100, dopasowanie dokładnych X/Y, KID i oczekiwanego NPC owner ID, porównanie kolejnych próbek.
- scripts/barony-live/package.json i README.md — przypięte wersje ggejs@2.2.0 oraz e4k-data@4.144.21-788.RC.3, instrukcja uruchomienia lokalnego.
- scripts/probe-pl1-live-map.py — teraz odmawia użycia EmpireCore dla stref E4K przed pobraniem loginu/hasła; domyślna nazwa strefy została poprawiona na EmpirefourkingdomsExGG_3.
- tests/test_probe_pl1_live_map.py — dodano test blokady niepotwierdzonego transportu.

Zasady działania nowego probe:

- Domyślnie planuje 3 punkty na krainę: 9 celów i 9 sektorów w aktualnym katalogu.
- --plan --all planuje 2021 celów w 199 sektorach (szacunkowo 1 990 000 pól mapy). Jest to tylko plan; pełnego skanu nie uruchamiano.
- Live odczyt jest ograniczony do produkcyjnego hosta i strefy PL1. Skrypt odmawia innego hosta/strefy.
- Każdy sektor jest odpytany osobno, z przerwą co najmniej 1000 ms. Nie zakładamy, że ten limit jest już zweryfikowany dla PL1; dlatego pełny skan jest wyłączony domyślnie.
- Wiersz uznawany za pasujący musi mieć dokładne X/Y, areaType=2, zgodny KID i oczekiwany owner ID (-220/-221/-222). Sam obiekt w tej samej lokalizacji nie wystarczy.
- Lokalny plik stanu przechowuje tylko ostatnie surowe, zweryfikowane obserwacje. Zmiana attackCount lub przejście cooldownu z nieaktywnego do aktywnego jest na razie wypisywane wyłącznie jako kandydacki sygnał z przedziałem między próbkami; sygnały nie są zapisywane jako potwierdzone ataki.
- attack_time_utc pozostaje null; nie wyliczamy dokładnej godziny z pozostałego cooldownu i nie ustalamy atakującego.
- Login/hasło są pobierane wyłącznie z lokalnych zmiennych środowiskowych. Nie są używane w GitHub Actions ani zapisywane w repozytorium.

### Testy i ograniczenia tej iteracji

Testy lokalne wykonane na kodzie probe:

- node --check — PASS.
- node --test probe-core.test.mjs — 10/10 PASS.
- Test trybu plan-only na syntetycznym katalogu — PASS: 9 celów, 9 sektorów, 90 000 pól; tryb plan nie wykonuje połączenia sieciowego.

Rzeczywisty katalog z repozytorium (snapshot 2026-11-05 15:11:37 UTC) został niezależnie przeliczony przez API GitHub:
- 2021 punktów: Piaski 671, Lód 779, Ogień 571;
- 199 unikalnych sektorów 100×100;
- plan próbki 3/kraina: 9 celów, 9 sektorów.

Nie wykonano live logowania ani odczytu PL1 w tej iteracji, ponieważ środowisko automatyzacji nie ma poświadczeń operatora. Nie wysłano żadnych danych logowania. W tej chwili nie ma potwierdzonego ataku PL1 i nie utworzono wpisów historii ataków.

Następny krok: operator uruchamia lokalnie najpierw domyślną próbkę 9 punktów na produkcyjnym PL1. Po uzyskaniu wierszy mapy trzeba wykonać drugą próbkę po około 10 minutach i sprawdzić, czy attackCount oraz cooldown zmieniają się zgodnie z rzeczywistym atakiem. Dopiero po takim teście można rozważyć zmianę kandydackiego sygnału na potwierdzone zdarzenie z przedziałem czasu.


## 16. Kontrola testów i publikacji po wdrożeniu probe — 2026-11-05

- Testy lokalne rdzenia probe: 11/11 PASS (walidacja katalogu, sektorów, dopasowania typu/KID/NPC owner ID, sygnałów licznika i cooldownu, mapowania właścicieli trzech krain).
- node --check probe.mjs — PASS na lokalnym pliku roboczym.
- Tryb plan-only na syntetycznym katalogu — PASS: 9 celów, 9 sektorów, 90 000 pól; bez połączenia sieciowego.
- Rzeczywisty katalog z main: 2021 celów / 199 sektorów; domyślna próbka: 9 celów / 9 sektorów.
- Próba npm install w środowisku automatyzacji przekroczyła limit 120 s i została przerwana. Nie uznaję zatem zależności npm ani live klienta za przetestowane w tym środowisku. Workflow baron-pl1-probe.yml ma teraz osobny krok instalujący przypięte pakiety i sprawdzający dokładny host/strefę PL1, wybór TCP oraz mapowanie wiersza dungeon. Status API dla bieżącego commitu zwrócił pustą listę statuses; nie deklaruję jeszcze PASS nowego przebiegu GitHub Actions.
- Ostatni potwierdzony workflow PL1 pozostaje 42052367160 — zakończony success; ostatni potwierdzony Pages build/deploy pozostaje 42052460959 — build, deploy i report-build-status success.
- Porównanie plików main z commitem ostatniej publikacji 11f92ee: barony.html, data/baron-fortresses.json, data/server-intel-history.json i data/location-snapshots.json mają identyczne SHA. W tym wdrożeniu zmieniono wyłącznie skrypty, testy, workflow diagnostyczny i dokumentację; nie zmieniono UI ani danych publikowanych na Pages. Strona pozostaje więc treściowo identyczna z ostatnią potwierdzoną publikacją; nie twierdzę, że wykonano nowy deploy dla commitów skryptowych.

Wniosek: ścieżka odczytu mapy E4K jest teraz opisana i przygotowana jako lokalny, read-only probe, ale **nie ma jeszcze live odczytu z produkcyjnego PL1**. Brakuje autoryzowanej sesji operatora i dwóch kolejnych próbek PL1, które potwierdzą zachowanie attackCount/cooldown. Do tego czasu żaden sygnał nie jest zapisywany jako potwierdzony atak.


## 17. E4K protokół mapy i raporty NPC — 2026-11-05

### Zweryfikowane w źródłach ggejs 2.2.0

- `DungeonMapobject`: `data[4]` → `attackCount`, `data[5]` → pozostały cooldown, `data[6]` → KID. X/Y pochodzą z `data[1:3]`, typ z `data[0]`.
- `attackCooldownEnd` powstaje jako lokalne `Date.now() + data[5] * 1000`; nie jest to serwerowy czas ataku.
- `attackCount` trafia do `DungeonConst.getLevel(victories, KID)`, więc biblioteka używa go jako licznika zwycięstw/postępu poziomu, a nie pełnego rejestru prób ataku.
- NPC owner IDs dla KID 1/2/3 to odpowiednio -220/-221/-222. Obecne mapowanie w probe jest zgodne z `WorldMapOwnerInfoData`.
- `WorldMapManager.getSector` pobiera sektor 100×100 przez `gaa` i wymaga, aby konto miało zamek w danej krainie.

Źródła: [DungeonMapobject](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/mapobjects/DungeonMapobject.js), [DungeonConst](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/utils/DungeonConst.js), [WorldMapOwnerInfoData](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/utils/WorldMapOwnerInfoData.js), [WorldMapManager](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/managers/WorldMapManager.js), [gaa](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/gaa.js).

### Raporty walki

Klient ma `sne` i typ raportu NPC attack (battle-log subtype 2). Raport zawiera KID/owner ID, a pobrany przez `bls` battle log zawiera mapobject z X/Y oraz uczestników walki. To może potwierdzić atak na konkretne współrzędne dla konta, które otrzymało raport. Nie jest to feed globalny: `sne` pobiera skrzynkę zalogowanego konta. `BasicMessage.deliveryTime` jest wyliczane z wieku wiadomości i nie jest potwierdzonym czasem rozpoczęcia ataku.

Źródła: [sne](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/sne.js), [BasicBattleLogMessage](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/messages/BasicBattleLogMessage.js), [BasicMessage](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/messages/BasicMessage.js), [bls](https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/bls.js).

### Różnica względem GGE Tracker

Kod API GGE Tracker przechowuje `dungeons_history` z `player_id` i `attacked_at`. Jego wewnętrzny parser dungeonów filtruje jednak obiekty typu `11` i mapuje `dungeon[5]` na pozostały cooldown, a `dungeon[6]` na `player_id`. `ggejs` dla E4K mapuje typ `2` do `DungeonMapobject`, gdzie `data[5]` jest cooldownem, a `data[6]` jest KID. Repozytorium GGE Tracker deklaruje obsługę serwerów E4K, ale ten parser dungeonów nie ma rozgałęzienia E4K dla tego mapowania. Nie potwierdzono więc, że `dungeon[6]` oznacza player ID w E4K_PL1_BETA/PL1; nie wolno przenosić tego parsera ani traktować go jako dowodu historii PL1. Produkcyjny `E4K_PL1` pozostawał wyłączony w ostatnim potwierdzonym teście API; Beta jest oddzielnym środowiskiem.

Źródła: [API dungeons](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts), [dungeon truth](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/tests/lib/dungeon-truth.ts), [scraper](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts).

### Testy i publikacja

- Lokalnie na kopii aktualnych plików z main: `node --check probe-core.mjs` PASS, `node --check probe.mjs` PASS, `node --test probe-core.test.mjs` **12/12 PASS**.
- Plan-only na syntetycznym katalogu: 9 celów, 9 sektorów, 90 000 pól, bez połączenia sieciowego.
- Brak live logowania PL1 i dwóch próbek; środowisko automatyzacji nie ma poświadczeń. Nie zapisano ataków.
- Workflow 42052367160 zakończył się sukcesem, ale nie zawierał jeszcze nowego kroku testującego E4K probe. Status-check API dla commitu 3c8f413 zwrócił pustą listę; nie deklaruję nowego PASS Actions.
- Pages build/deploy 42052460959: success. SHA `barony.html`, katalogu fortec, historii Szpiegowania i snapshotów lokalizacji są identyczne jak w deploy commicie `11f92ee`; UI/dane strony nie zmieniły się w tej iteracji.

Wniosek: statyczny kontrakt E4K i ograniczony kanał raportów własnego konta są potwierdzone w kodzie biblioteki, ale brak live PL1 nadal uniemożliwia potwierdzenie ataków i dokładnego czasu.

## 18. Świeży import IT1 i naprawa kontraktu publikacji — 2026-11-05 18:10 UTC

### Import mapy

Workflow `42081486806` pobrał rzeczywiste dane z GGE Tracker IT1 i zakończył się sukcesem. Nowy snapshot:
- `captured_at=2026-11-05T18:09:27.536395Z`;
- Piaski 671, Lód 779, Ogień 571; razem 2021;
- 2021 unikalnych współrzędnych, 0 duplikatów, 0 niepoprawnych punktów;
- 0 pól cooldownu/gotowości/gracza/historii ataków;
- porównanie ze snapshotem 15:11:37 UTC: 0 dodanych i 0 usuniętych współrzędnych;
- 199 sektorów 100×100 w pełnym planie odczytu.

Commit danych: `e6d2d963`.

### Wykryty i naprawiony błąd importera

Poprzedni `scripts/import_it1_fortresses.py` generował rekordy z polami `source` i `match_verified_on_target`, ale nie ustawiał wymaganego przez aktualny katalog pola `type: "dungeon"`. Wartość głównego pola `source` nie zawierała też frazy `map coordinates only`. To rozjeżdżało kontrakt importera z walidatorem Barony i mogło spowodować, że kolejny import opublikowałby katalog odrzucany przez probe.

Poprawiono:
1. importer zapisuje teraz dokładnie mapowy schemat używany przez stronę i probe: ID, KID, krainę, X/Y, typ oraz źródło IT1;
2. importer odrzuca jawne rekordy o typie innym niż 11 oraz współrzędne poza zakresem 0–1286;
3. nie kopiuje arbitralnych pól API, więc cooldown, gotowość, gracz i historia nie przedostaną się do katalogu;
4. wykryte duplikaty współrzędnych zatrzymują import zamiast po cichu nadpisywać rekord;
5. zachowywany jest poprzedni kompletny katalog, gdy skan jest niepełny lub mniejszy;
6. workflow importu uruchamia po pobraniu walidator publikowanego JSON i pełny plan Barony przed commitem;
7. workflow importu uruchamia się także po zmianie importera/testów/workflow, oprócz harmonogramu.

### Testy i deployment

- importer: Python unit tests — PASS;
- walidator publikowanego katalogu `scripts/test-baron-map-catalog.mjs` — PASS;
- plan Barony: 2021 cele / 199 sektorów — PASS;
- workflow PL1 `42081486716`: wszystkie kroki PASS, w tym testy rdzenia, instalacja przypiętego klienta E4K, test mobilny, walidator katalogu i uruchomienie diagnostyki publicznych źródeł;
- Pages dla commitu danych `e6d2d963`, workflow `42081530187`: build PASS, deploy PASS, raport statusu PASS.

Zmiany dotyczyły importera, testów, workflow i danych fortec. Nie zmieniono `barony.html`, `mapa-rb.html`, Mapa, Szpiegowanie ani Dodatkowe.

### Produkcyjny PL1 — nadal bez potwierdzonej historii

Workflow diagnostyczny zakończył się poprawnie jako proces, ale status runu nie zawiera treści odpowiedzi poszczególnych endpointów. Nie wyciągam więc z samego zielonego statusu wniosku, że API zaakceptowało PL1. Ostatnie szczegółowo zapisane wyniki nadal wskazują, że GGE Tracker `/dungeons` odrzuca produkcyjny `E4K_PL1`, a Beta jest odrębnym serwerem.

Lokalny `scripts/barony-live/probe.mjs` nie został uruchomiony live: wymaga lokalnej autoryzowanej sesji operatora. Wiersz typu 11 może zawierać `defeaterPlayerId`, ale nie ma w nim dokładnego `attacked_at`. Nie zapisano żadnych zdarzeń ataku.

Następny krok: odczytać wynik per-endpoint z logu workflow `42081486716`, a następnie — po stronie operatora — wykonać dwie małe próbki live PL1 na autoryzowanej sesji i porównać konkretne `kid/x/y`, `defeaterPlayerId` oraz przejście cooldownu. Do tego czasu sygnały pozostają kandydackie, a dokładny czas ataku pozostaje nieustalony.


## 19. Świeży import IT1, test rzeczywistego schematu API i odczyt GAM — 2026-11-05 20:08 UTC

### Ponowna weryfikacja mapy IT1

Bezpośredni odczyt publicznego API GGE Tracker z nagłówkiem `gge-server: IT1`:
- `GET /api/v1/dungeons?page=1&size=4000&filterByKid=[1,2,3]`: HTTP 200, 2021 rekordów na jednej stronie;
- Piaski/KID 1: 671, Lód/KID 2: 779, Ogień/KID 3: 571;
- 0 nieprawidłowych współrzędnych i 0 duplikatów;
- `/dungeons/meta`: ostatni skan zgłoszony przez API `2026-11-05T20:05:37.282Z`;
- w bezpośrednim porównaniu współrzędnych wykonanym o 20:01 UTC API i katalog miały identyczny zestaw 2021/2021 punktów, bez brakujących ani dodatkowych pozycji.

API IT1 zwraca również pola dynamiczne (m.in. `player_id`, `player_name`, `total_attack_count`, `available_duration_seconds`, `effective_cooldown_until`, `last_attack`). Nie są one kopiowane do katalogu strony.

### Świeży import i test normalizacji

Commit testu: `da0d190d5cd50a551b2a60f1cb62089c15788676`.

- Workflow importu `42099856157`: PASS; 21 testów Python; importer pobrał 2021 rekordów z 1 strony.
- Dodany test odwzorowuje rzeczywisty kształt wiersza GGE Tracker (bez `area_type` i źródłowego ID, ale z polami gracza/historii/cooldownu) i wymaga, by wynik zawierał wyłącznie schemat mapowy.
- Walidator: PASS — 2021 unikalnych współrzędnych, brak pól ataku/cooldownu/gracza/gotowości.
- Plan Barony: 2021 celów, 199 sektorów 100×100, 1 990 000 szacowanych pól.
- Nowy snapshot zapisany przez importer: `captured_at=2026-11-05T20:04:20.052153Z`, `pages_read=1`.
- Commit danych po imporcie: `a6fd9392e81e395ac2ab78bb4058a3e920913fac`.

### Rozszerzenie read-only GAM w lokalnym probe

Na podstawie kodu przypiętego `ggejs 2.2.0` potwierdzono:
- `GAM` jest parsowane do `client.movements` przez `gam.js`;
- `MovementManager.get()` zwraca bieżące ruchy, a `BasicMovement` mapuje typ ruchu, kierunek, ID ruchu, źródło/cel, KID oraz lokalnie wyliczone czasy odjazdu/przyjazdu;
- źródło i cel są parsowane z właścicielami; typ 11 celu tworzy `BossDungeonMapobject`.

Wprowadzono w module Barony:
1. `extractParsedOutboundBossDungeonMovementEvidence` — waliduje typ ruchu 11, kierunek wychodzący, typ celu 11, zgodny KID i właściciela NPC (-230/-231/-232), dodatni ID właściciela źródła oraz dokładne X/Y;
2. `node scripts/barony-live/probe.mjs --movements` — opcjonalnie pasywnie obserwuje aktualizacje `GAM` wypychane przez serwer po lokalnym, autoryzowanym zalogowaniu; nie wysyła nieudokumentowanej komendy i obserwuje maksymalnie 3 sekundy (regulowane `--movement-wait-ms`);
3. ruchy są wyłącznie wypisywane w wyniku lokalnego probe — nie są zapisywane do pliku stanu ani repozytorium;
4. klasyfikacja została zmieniona na `observed_outbound_npc_attack_movement_to_boss_dungeon`, aby nie mylić ruchu w drodze z zakończoną bitwą.

Ograniczenia:
- ID atakującego i dokładne X/Y są potwierdzone tylko dla ruchów zwróconych zalogowanej sesji;
- `departureTime` i `arrivalTime` w `ggejs` są wyliczane lokalnie z czasu trwania ruchu; odjazd jest estymacją, nie serwerowym timestampem ataku;
- `attack_time_utc` pozostaje null;
- GAM nie jest globalnym feedem PL1 i nie potwierdza zakończenia bitwy;
- ten tryb nie został uruchomiony live, ponieważ automatyzacja nie ma lokalnych poświadczeń operatora.

### Korekta bezpieczeństwa GAM po inspekcji kodu biblioteki

Po ponownym sprawdzeniu `ggejs` stwierdzono, że `src/commands/gam.js` eksportuje parser odpowiedzi i aktualizuje `MovementManager`, ale nie udostępnia udokumentowanej metody żądania snapshotu. Dlatego lokalny probe został skorygowany: `--movements` tylko pasywnie obserwuje aktualizacje `GAM` wypychane przez serwer. Nie wysyła ręcznie `sendCommand('gam', ...)`. Brak pushu w oknie obserwacji jest opisany jako brak zaobserwowanej aktualizacji, a nie jako brak aktywnych ruchów. Wyniki nadal nie są zapisywane.

### Testy, deployment i diagnostyka PL1

Najnowszy workflow probe `42100365201` dla commitu `ec2fc1a89bea2ed699bdaa9a70cd6fa450b1ed37`:
- Python probe tests: 13/13 PASS;
- Node core tests: 22/22 PASS;
- kontrola przypiętego klienta E4K, hosta PL1 i transportu TCP: PASS;
- test mobilny Barony (viewport, cele dotykowe 44 px, focus, etykiety lokalnej historii i separacja dowodów): PASS;
- walidator katalogu IT1: PASS;
- diagnostyka publicznych endpointów: wykonana, ale bez dostępu do produkcyjnej historii PL1.

Najnowszy Pages build/deployment `42100365593` dla tego samego commitu: build PASS, deploy PASS, report-build-status PASS.

Wyniki publicznego API w przebiegu `42100365201`:
- `E4K_PL1` na `/dungeons` i `/dungeons/meta`: HTTP 400, Invalid server;
- katalog serwerów: produkcyjny `E4K_PL1` ma `enabled=true`, `fortress=false`; `E4K_PL1_BETA` ma `fortress=true`;
- Beta: 976 rekordów; 5/5 historii niepustych (7763 rekordy w tych próbkach) — wyłącznie diagnostyka Beta;
- produkcyjny PL1: 3/3 testowanych identyfikatorów z migawki Szpiegowania nierozpoznane, historia HTTP 400 `Invalid player ID`;
- `empire-api.fly.dev/status`: HTTP 200, ale `EmpirefourkingdomsExGG_3=false`; zapytania GAM/GAA zostały pominięte z powodu braku potwierdzonego socketu.

Pierwszy CI uruchomiony bezpośrednio po zmianie etykiety ekstraktora zakończył się 1 niepowodzeniem testu, ponieważ test oczekiwał starej etykiety `confirmed_...`. Zaktualizowano asercję i dodano testy parsed MovementManager; następny przebieg `42100365201` przeszedł 22/22. To był błąd przejściowy testu, nie błąd produkcyjnego odczytu.

### Wniosek i następny krok

- Katalog IT1: świeży, zweryfikowany i opublikowany jako współrzędne mapy bez danych cooldownu/gotowości.
- Lokalny probe ma teraz dwie bezpieczne ścieżki: odczyt wierszy mapy przez `GAA` oraz opcjonalny snapshot ruchów przez `GAM`.
- Produkcyjny PL1 nadal nie ma potwierdzonego publicznego endpointu historii fortec, a most nie ma aktywnego socketu PL1.
- Nie wykonano autoryzowanego logowania operatora, nie odczytano live GAM z PL1 i nie zapisano żadnych zdarzeń ataku.

Następny krok: operator uruchamia lokalnie `node scripts/barony-live/probe.mjs --movements` w autoryzowanej sesji PL1, a następnie powtarza próbkę po kilku minutach. Ruchy pozostają obserwacją aktywnego ataku w drodze; do historii zakończonych ataków potrzebny będzie wiarygodny raport walki lub serwerowy dziennik zdarzeń z czasem.


## 20. Raporty bitew NPC ze skrzynki konta i najnowsza weryfikacja Pages — 2026-11-05 20:18 UTC

### Ostateczne porównanie opublikowanej mapy z żywym IT1

Bezpośrednie zapytanie GGE Tracker wykonane po imporcie:
- IT1 `/dungeons`: HTTP 200, 2021/2021 rekordów na jednej stronie;
- KID 1/2/3: 671/779/571;
- 0 duplikatów, 0 nieprawidłowych współrzędnych;
- `/dungeons/meta.last_scan_at=2026-11-05T20:07:36.656Z`;
- porównanie zbiorów `kid/x/y`: żywe API i opublikowany katalog mają identyczne 2021 współrzędne;
- opublikowany JSON przez GitHub Pages: HTTP 200, `captured_at=2026-11-05T20:04:20.052153+00:00`, 2021 rekordów, wyłącznie pola mapowe.

W źródłowym wierszu IT1 nadal występują dynamiczne pola gracza/ataku/cooldownu, ale nie ma ich w publicznym katalogu. Importer nie został rozszerzony o te dane.

### Nowe źródło dowodów: raporty bitew NPC w skrzynce zalogowanego konta

Inspekcja przypiętego `ggejs 2.2.0` potwierdziła:
- `GBD` wywołuje `requestMessagesData()`, które pobiera skrzynkę przez `SNE`;
- `BattleLogNPCAttackMessage` jest wybierany dla `messageType=6`, area type 11 i subtype NPC attack 2;
- ważny szczegół implementacyjny: klasa `BasicBattleLogMessage` nie ustawia właściwości `message.subType` (pozostaje domyślne 0); subtype jest zakodowany w `message.metadata` jako część `areaType+subType+result`;
- szczegóły raportu są pobierane read-only przez `getBattleLog()`, czyli `BLS`, `BLM` i `BLD`;
- `BattleParticipant` udostępnia `playerId` oraz `ownerInfo.playerName`, jeśli dane właściciela są obecne w odpowiedzi.

Wprowadzono:
1. `isNpcBattleReportMessage` — wybiera subtype 2 z `message.metadata`, nie z nieustawionej właściwości;
2. opcję lokalną `--reports` — po logowaniu wybiera najnowsze raporty NPC z własnej skrzynki i pobiera ich szczegóły;
3. ekstrakcję dokładnego KID/X/Y, ID atakującego, nazwy gracza (jeśli dostępna), wyniku bitwy, ID wiadomości/raportu oraz czasu dostarczenia raportu;
4. limit domyślny 10 raportów, maksymalnie 25; nie usuwa, nie oznacza jako przeczytane i nie przekazuje wiadomości;
5. wynik jest tylko wyświetlany lokalnie — nie jest dopisywany do historii, pliku stanu ani repozytorium.

Ograniczenia czasu:
- `BasicMessage.deliveryTime` jest wyliczany jako lokalne `Date.now() - data[5] * 1000`, czyli wiek wiadomości ze skrzynki;
- parsery `BLS/BLM/BLD` nie wystawiają pola dokładnego czasu rozpoczęcia ataku;
- dlatego `report_delivery_time_estimate_utc` jest czasem dostarczenia/odczytu raportu, a `attack_time_utc` pozostaje null;
- raporty są widoczne tylko dla zalogowanego konta (w tym ewentualnie raporty przekazane dalej); nie są globalnym rejestrem wszystkich ataków PL1.

Opcja `--movements` pozostaje pasywnym obserwatorem pushy `GAM`; nie wysyła nieudokumentowanej komendy. Ruch w drodze daje atakującego i cel dla sesji konta, ale czas wyjścia jest lokalną estymacją i nie dowodzi zakończenia bitwy.

### Najnowsze testy i stan produkcyjny

Workflow `42102074057` dla commitu `3a596514adc11d323e07c9b67a9b2ebbd4eb5b7d`:
- testy Python: 13/13 PASS;
- testy Node: 23/23 PASS;
- kontrola klienta `ggejs`/metadanych PL1: PASS;
- test mobilny Barony: PASS;
- walidator katalogu IT1: PASS;
- diagnostyka API PL1: wykonana, lecz nie uzyskała historii produkcyjnej.

Aktualne wyniki PL1:
- katalog serwerów: `E4K_PL1 enabled=true, fortress=false`; Beta ma `fortress=true`;
- `/dungeons` i `/dungeons/meta` dla `E4K_PL1`: HTTP 400 / Invalid server;
- trzy identyfikatory z migawki Szpiegowania: 3/3 `Player not found`, historia 3/3 `Invalid player ID`;
- wariant z sufiksem `zoneId=259`: 3/3 `Invalid player ID`;
- brak trzycyfrowego kodu w katalogu serwerów, więc test sufiksu kodu został bezpiecznie pominięty;
- most `empire-api.fly.dev`: HTTP 200, ale produkcyjny socket `EmpirefourkingdomsExGG_3=false`; GAA/GAM przez most pominięto.

Pages workflow `42102074287` dla commitu `3a596514adc11d323e07c9b67a9b2ebbd4eb5b7d` został anulowany przez nowszy commit. Końcowy build/deploy dla commitu `29036c876091050bf269a207c9ef1f58a3646dc0` zakończył się sukcesem w runie `42102461861` (build, deploy, report-build-status: PASS).

### Błędy przejściowe i osobny workflow

Podczas kolejnych małych commitów CI wykrył:
- starą asercję po zmianie nazwy klasyfikacji ruchu;
- brak dodanego pola `attacker_player_name` w normalizatorze parsed movement.

Obie przyczyny zostały poprawione; najnowszy probe workflow przechodzi 23/23 testy.

Osobny workflow `Empirenew location tracker` (`42101624821`) nadal kończy się błędem poza modułem Barony: komenda `ain` dla serwera Beta zwróciła HTTP 500 `Server not connected` na `EmpirefourkingdomsExGG2_3`. Nie zmieniano tego modułu w tej iteracji.

### Wniosek

- IT1: aktualne współrzędne 2021/2021 są zgodne z opublikowanym katalogiem map-only.
- Barony: testy offline, walidacja i test mobilny przechodzą.
- Nowe lokalne źródło raportów NPC może dostarczyć konkretny cel i atakującego z raportów dostępnych na koncie, ale nie dokładny czas ataku ani globalną historię.
- Produkcyjny PL1 nadal nie udostępnia potwierdzonego publicznego katalogu fortec/historii, a automatyzacja nie ma lokalnych poświadczeń operatora. Nie wykonano live `--reports` ani `--movements`, nie zapisano żadnych zdarzeń ataków.

Następny krok: po lokalnym, autoryzowanym uruchomieniu `node scripts/barony-live/probe.mjs --reports` porównać raporty z konkretnymi współrzędnymi; osobno uruchomić `--movements` i sprawdzić, czy serwer wypycha aktualizacje GAM. Każdy rekord powinien zachować rozdział między czasem raportu, estymowanym odjazdem ruchu i nieznanym dokładnym czasem ataku.
