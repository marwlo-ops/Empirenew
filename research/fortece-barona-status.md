# Fortecy i historia ataków — dziennik potwierdzonych testów

Ostatnia aktualizacja: 2026-11-06. Dane w tym dokumencie rozdzielają potwierdzone wyniki od hipotez i nierozwiązanych problemów.

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


## 20. Wspólny selektor raportów NPC dla obu probe — 2026-11-05 20:28 UTC

W przeglądzie aktualnego kodu wykryto niespójność: zintegrowany probe.mjs rozpoznawał podtyp raportu NPC z message.metadata, natomiast osobny reports.mjs nadal filtrował wyłącznie message.subType. W ggejs pole subType może pozostać równe 0, gdy właściwa wartość 2 znajduje się w metadanych. W efekcie samodzielny probe mógł pomijać prawidłowe raporty.

Poprawki:
- dodano wspólny selectLatestNpcBattleReportMessages() w probe-core.mjs;
- oba probe korzystają teraz z tego samego rozpoznawania messageType=6, areaType=11 i podtypu NPC odczytanego z metadanych z bezpiecznym fallbackiem;
- selektor wybiera najnowsze raporty według czasu dostarczenia, a rekordy bez poprawnego czasu pozostawia na końcu;
- limit jest walidowany (1–100);
- komunikat attack_time_status wskazuje rzeczywistą nazwę pola report_delivery_time_estimate_utc i nadal wyraźnie oddziela szacowany czas dostarczenia od czasu rozpoczęcia ataku;
- dodano test regresyjny dla subType=0 + metadata=11+2+..., sortowania najnowszych raportów i odrzucania niepowiązanych wiadomości.

Zakres: wyłącznie scripts/barony-live/** oraz ten dziennik. Nie zmieniono barony.html, mapa-rb.html, danych mapy ani zakładek Mapa, Szpiegowanie i Dodatkowe.

Wyniki testów Actions dla tego commitu są oczekiwane; do czasu zakończenia nowego workflow nie oznaczamy ich jako PASS. Żaden probe nie został uruchomiony na żywo bez autoryzowanej sesji operatora. Nie zapisano żadnych zdarzeń ataku.

Ostatni potwierdzony katalog mapy pozostaje snapshotem 2026-11-05T20:04:20.052153Z: 2021 punktów (Piaski 671, Lód 779, Ogień 571), bez duplikatów i pól cooldownu/gotowości/gracza/historii. API /dungeons/meta w ostatnim zapisanym odczycie zgłaszało skan 2026-11-05T20:05:37.282Z. W tej iteracji nie wykonano kolejnego bezpośredniego pobrania endpointu, więc nie przedstawiam tego snapshotu jako świeżego odczytu z 20:28 UTC.


## 21. Bezpośrednia inspekcja czasu w raportach ggejs — 2026-11-05 20:34 UTC

Ponownie odczytano kod przypiętego upstream ggejs (bez wykonywania logowania):
- BasicMessage.js ustawia deliveryTime jako Date.now() - data[5] * 1000. Jest to lokalne oszacowanie wieku wiadomości, a nie timestamp serwera ani chwila ataku.
- BasicBattleLogMessage.js parsuje subtype z pierwszego segmentu metadata (areaType+subType+wynik), a KID i owner ID z drugiego segmentu. getBattleLog() pobiera BLS, BLM i BLD.
- bls.js zwraca ID raportu, obiekt mapy, uczestników, wynik i parametry walki, ale nie wystawia czasu rozpoczęcia ataku.
- blm.js i bld.js uzupełniają dowódców, fale, narzędzia i jednostki; w przeglądanym kodzie nie znaleziono pola czasu/datowania walki.

Wniosek: raport NPC może potwierdzić dokładny cel (KID/X/Y) i ID atakującego dla wiadomości z konkretnej skrzynki, ale nie daje dokładnego czasu ataku. Pole deliveryTime może być pokazane wyłącznie jako szacowany czas dostarczenia wiadomości; dla przekazanych raportów nie jest to nawet pierwotny czas dostarczenia. Nie wolno mapować go na attacked_at.

Źródła upstream:
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/messages/BasicMessage.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/structures/messages/BasicBattleLogMessage.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/bls.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/blm.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/bld.js

Zakres repozytorium: wyłącznie dokumentacja badawcza. Nie zmieniono kodu UI, mapy ani danych publikowanych. Nie wykonano live połączenia PL1 i nie zapisano zdarzeń ataku.


## 22. Audyt aktualnego katalogu i czasu historii — 2026-11-05 20:46 UTC

### Publiczny katalog serwerów — ponowny odczyt live

Bezpośredni odczyt `GET https://api.gge-tracker.com/api/v1/servers/catalog` (HTTP 200, cache bypass) potwierdził:
- `E4K_PL1`: `enabled=true`, `fortress=false`;
- `E4K_PL1_BETA`: `enabled=true`, `fortress=true`;
- publiczny wpis nie zawiera `code`, `zone` ani `zone-id`. Nie ma podstaw do konstruowania trzycyfrowego sufiksu ID gracza na podstawie tego katalogu.
Lista `/servers` zawiera nazwy serwerów, ale nie publikuje kodu routingu.

### Semantyka `attacked_at` — wynik audytu scrapera

W kodzie live scrapera GGE Tracker `persistDungeonUpdates()` zapisuje do `dungeons_history` wyłącznie `kid`, `position_x`, `position_y`, `player_id`; nie przekazuje `attacked_at`. `scanDungeonCooldowns()` wybiera tylko rekordy, których poprzedni cooldown globalny wygasł, a następnie zapisuje obserwację, jeśli bieżący cooldown jest dodatni. Worker ma domyślny interwał 120 sekund. API odczytuje `DH.attacked_at`, lecz w przeglądanym repozytorium nie znaleziono definicji schematu/triggera wyjaśniającego jego źródło. Pole pozostaje niepotwierdzonym czasem bazy/obserwacji, a nie serwerowym timestampem ataku.

### GAM — zawężenie obserwatora

`ggejs` ma handler odpowiedzi `commands/gam.js`, który aktualizuje `MovementManager`; nie znaleziono udokumentowanego żądania wychodzącego GAM. Probe pozostaje pasywny. Zmieniono filtr, by rozpoznawał wyłącznie stos wywołań `commands/gam.js`; inne handlery aktualizujące `MovementManager` nie są liczone jako GAM. Test obejmuje ścieżkę Unix i Windows. Batch jest opatrzony czasem jego otrzymania. To nadal obserwacja ruchów widocznych dla jednego zalogowanego konta, nie globalny feed.

### Most PL1 — odczyt live

Odczyt `GET https://empire-api.fly.dev/status` (HTTP 200) o 20:46 UTC:
- `EmpirefourkingdomsExGG_3=false`;
- `EmpirefourkingdomsExGG2_3=false`.
Nie wykonano GAA/GAM przez most, ponieważ żaden z aliasów produkcyjnego PL1 nie zgłasza połączenia. Nie było autoryzowanej sesji operatora, więc lokalnego probe mapy/ruchów/raportów nie uruchomiono.

### Zakres i status

Zmiana kodu dotyczy wyłącznie observera GAM w `scripts/barony-live/**`; niniejszy dziennik dotyczy wyłącznie badań Barony. Nie zmieniono `barony.html`, danych mapy, Mapa, Szpiegowanie ani Dodatkowe. Nie zapisano żadnych ataków. `attack_time_utc` pozostaje null bez źródła serwerowego.


## 23. Świeży import IT1, walidacja i ponowna diagnostyka PL1 — 2026-11-05 22:02–22:04 UTC

### Zmiana bezpieczeństwa importera

W commicie `818ca4296d5cdba4b172d1a88e78bba44e648f6e` poprawiono `integer()` w `scripts/import_it1_fortresses.py`: Python traktuje `bool` jako podtyp `int`, więc wartości `true/false` mogły wcześniej zostać zaakceptowane jako KID lub współrzędne. Importer odrzuca teraz boolean przed konwersją liczbową. Dodano test dla boolean w KID, X i Y. Zmiana dotyczy wyłącznie importera i jego testów.

### Świeży odczyt GGE Tracker IT1

Workflow `42117999850` wykonał rzeczywiste żądanie `GET /api/v1/dungeons` z nagłówkiem `gge-server: IT1` i zakończył się sukcesem.

- Czas pobrania zapisany w katalogu: `2026-11-05T22:02:33.893503+00:00`.
- 1 strona API, 2021 rekordów.
- Piaski: 671; Lód: 779; Ogień: 571.
- 2021 unikalnych współrzędnych; 0 duplikatów; 0 niepoprawnych współrzędnych.
- Porównanie ze snapshotem `2026-11-05T20:04:20.052153Z`: 0 nowych i 0 usuniętych współrzędnych.
- Każdy rekord ma dokładnie dozwolone pola: `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`. Nie ma pól cooldownu/gotowości, gracza ani historii ataków.
- Pełny plan Barony: 2021 cele, 199 sektorów 100×100, 1 990 000 potencjalnych pól mapy do odczytu.

Importer utworzył commit danych `2e71e25d8ff656f5fa4db882da6fb57937904d00`. Walidacja katalogu i planu zakończyły się PASS.

### Testy i publikacja

- Importer i pełny zestaw Python: 22/22 PASS.
- Lokalny probe mapy offline: 13/13 PASS.
- Rdzeń Barony / E4K: 28/28 PASS.
- Walidator katalogu mapy: PASS.
- Test mobilnego UI (statyczny): PASS; sprawdzono viewport, cele dotykowe 44 px, focus, etykiety historii lokalnej i separację dowodów.
- Build Pages, deploy i raport statusu: PASS, workflow `42118029347`, zakończony `2026-11-05T22:04:12Z`.

Test mobilny jest testem statycznym CI, nie próbą na fizycznym telefonie. W tej iteracji nie zmieniono `barony.html`, `mapa-rb.html`, `Mapa`, `Szpiegowanie` ani `Dodatkowe`.

### Ponowna diagnostyka produkcyjnego PL1

Workflow `42117999808` zakończył się sukcesem jako wykonanie diagnostyki, ale nie potwierdził źródła historii ataków:

| Próba | Wynik |
|---|---|
| GGE Tracker `/dungeons`, `EmpirefourkingdomsExGG_3` | HTTP 400 — nieprawidłowy/nieobsługiwany serwer |
| GGE Tracker `/dungeons`, `EmpirefourkingdomsExGG2_3` | HTTP 400 |
| GGE Tracker `/dungeons`, `E4K_PL1` | HTTP 400 |
| GGE Tracker `/dungeons`, `PL1` | HTTP 400 |
| GGE Tracker `/dungeons`, `E4K_PL1_BETA` | HTTP 200, 976 rekordów — tylko Beta |
| GGE Tracker `/dungeons`, `IT1` | HTTP 200, 2021 rekordów |
| Historia 5 graczy z rekordów Beta | 5/5 niepustych; 2664 rekordy — wyłącznie Beta |
| Historia 3 próbkowanych graczy produkcyjnego PL1 | 3/3 `Invalid player ID`; wyszukiwanie gracza 3/3 `Player not found` |
| Historia z sufiksem zoneId 259 | 3/3 `Invalid player ID` |
| `empire-api.fly.dev/status` | HTTP 200, ale `EmpirefourkingdomsExGG_3` `target_connected=false` |
| GAA/GAM przez most | Pominięte, bo socket PL1 nie był połączony |

Beta nadal nie jest źródłem produkcyjnego PL1 i jej 2664 rekordy nie zostały skopiowane. GAA/GAM nie zostały wysłane do niepołączonej sesji. Nie wykonano autoryzowanego lokalnego logowania do gry; w tej iteracji nie uzyskano więc globalnego feedu ruchów ani raportów z konta operatora.

### Błąd CI i odrębny workflow

Wcześniejszy przebieg `42106187877` zakończył się błędem składni wyrażenia regularnego w filtrze stosu GAM. Poprawka normalizacji ścieżki i sprawdzania fragmentu `/commands/gam.js:` została wprowadzona w commicie `5011eda`; bieżące 28 testów obejmuje selekcję wyłącznie odpowiedzi handlera GAM i przechodzi.

Niezależny workflow `Empirenew location tracker` `42116900931` nadal zakończył się błędem `ain: HTTP 500`, odpowiedź `Server not connected` na aliasie `EmpirefourkingdomsExGG2_3`. To nie jest workflow Barony; nie zmieniano go w tej iteracji.

### Wniosek

Katalog IT1 został ponownie pobrany z API, zweryfikowany i wdrożony na Pages. Importer ma dodatkową ochronę przed boolean jako współrzędną. Produkcyjny PL1 nadal nie udostępnił przez sprawdzone źródła historii fortec; nie zapisano żadnego zdarzenia ataku. `attacked_at` pozostaje nieustalone.

## 24. Walidacja kodu odpowiedzi GAM przed przyjęciem batcha — 2026-11-05 23:10 UTC

### Ustalenie z kodu klienta

Audyt źródła przypiętego klienta ggejs wykazał, że SocketManager.sendCommand() zwraca wynik zapisu do socketu, a nie potwierdzenie przyjęcia komendy przez serwer. Odpowiedź XT jest następnie rozdzielana w SocketManager.onSocketMessage() i przekazywana do commands/index.js, gdzie onResponse() odczytuje commandId, pomija pole strefy i parsuje serwerowy errorCode.

Istotny szczegół: handler commands/gam.js wywołuje MovementManager._add_or_update() przed obsługą callbacku i robi to również dla odpowiedzi, której errorCode jest niezerowy. Samo zaobserwowanie wywołania _add_or_update([]) nie wystarcza zatem do uznania pustej migawki za udany odczyt.

Źródła upstream:
- SocketManager.sendCommand(), onSocketMessage() i writeToSocket(): https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/managers/SocketManager.js
- parsowanie kodu odpowiedzi i dispatch handlera: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/main/src/commands/index.js
- handler GAM i bezwarunkowe _add_or_update(): https://github.com/476f6f6467616d6553747564696d6553747564696f73/ggejs/blob/main/src/commands/gam.js
- niezależna implementacja pygge.get_movements() wysyła gam {} i czeka na kolejne odpowiedzi: https://github.com/danadum/pygge/blob/f0ed456bd7b522f3f33b4f14fbb4856aa54ced64/pygge/map/movements.py

### Poprawka

W scripts/barony-live/probe.mjs observer przechwytuje teraz przed dispatch handlera wyłącznie metadane odpowiedzi XT: nazwę komendy, nieinterpretowane drugie pole XT, kod błędu i czas odbioru; osobno zapisuje strefę skonfigurowanej sesji. Kod klienta ggejs i niezależnego pygge pomija drugie pole podczas dekodowania, więc nie przypisujemy mu znaczenia strefy. Nie przechowuje payloadu odpowiedzi. Batch ruchów otrzymuje powiązany response_ok i response_error_code.

W scripts/barony-live/probe-core.mjs dodano parseGgejsCommandResponseEnvelope() oraz rozszerzono buildGamProbeSummary(). Batch jest przyjmowany jako źródło ruchów tylko wtedy, gdy odpowiedź dla dokładnej strefy PL1 ma kod sukcesu 0 lub 10005. Kody błędów, nieparsowalne statusy, brak envelope albo brak batcha są raportowane osobnymi statusami; nie mogą zostać przedstawione jako udana pusta migawka.

### Testy

Dodano testy:
- parsowania sukcesu, kodu zgodności 10005, błędu i nieparsowalnego envelope;
- odrzucenia batcha z niezerowym kodem serwera;
- odrzucenia batcha bez zweryfikowanego statusu;
- przyjęcia batcha wyłącznie po zweryfikowanym sukcesie.

Testy wcześniejszej logiki pozostają bez zmiany. Wykonano wszystkie 32 przypadki z scripts/barony-live/probe-core.test.mjs w izolowanym harnessie JavaScript: 32/32 PASS. To nie jest uruchomienie node --test ani GitHub Actions. Siedem kontroli kontraktu na publicznym źródle upstream ggejs (dispatch XT, kolejność pól, handler GAM) również przeszło. Workflow .github/workflows/baron-pl1-probe.yml rozszerzono tak, aby w CI sprawdzał tę samą kolejność w faktycznie zainstalowanej, przypiętej wersji ggejs. Dostępny odczyt status checks dla najnowszych commitów zwrócił pustą listę, więc pełny wynik CI dla zmian pozostaje niepotwierdzony.

### Ograniczenia

GAM nadal zwraca ruchy widoczne dla autoryzowanego konta, a nie globalną historię serwera. W tej zmianie nie wykonano logowania do PL1 ani nie uzyskano odpowiedzi live z PL1. Nie zapisano ataków. attack_time_utc pozostaje null; czas lokalnego odbioru i wyliczony czas wyjścia ruchu nie są dokładnym serwerowym timestampem ataku.

Zmodyfikowano wyłącznie skrypty scripts/barony-live/** i niniejszy dziennik badań. Nie zmieniono barony.html, danych mapy, Mapa, Szpiegowanie ani Dodatkowe.

## 25. Semantyka `dungeons_history.attacked_at` i identyfikatora gracza — audyt źródła GGE Tracker, 2026-11-06

### Wynik audytu

Przeanalizowano kod GGE Tracker przypięty do commita `7d620820a76cde4176c752f6972ce6f0c9ad7ab1`. W publicznym kodzie scrapera **nie ma przekazania czasu ataku z odpowiedzi gry do kolumny `dungeons_history.attacked_at`**.

1. `appendDungeons()` przyjmuje tylko obiekty typu `11`; odczytuje `dungeon[5]` jako pozostały cooldown i `dungeon[6]` jako ID gracza, a `updatedAt` ustawia lokalnie przez `new Date()`.
2. `updateDungeonsList()` wybiera rekordy fortec, których zapisany `global_available_at <= NOW()`, a następnie wywołuje `scanDungeonCooldowns()`.
3. `collectDungeonCooldowns()` ponownie odczytuje GAA. Dla typu `11` z dodatnim `dungeon[5]` tworzy wpis z `player_id = dungeon[6]` i wylicza nowe terminy cooldownu względem lokalnego `currentTime`. Nie odczytuje pola serwerowego z czasem ataku. Komentarz w kodzie mówi o obliczeniu daty ostatniego ataku, ale implementacja zapisuje tylko pozostały cooldown, ID gracza i terminy wyliczone od czasu próbki.
4. `persistDungeonUpdates()` wykonuje `INSERT INTO dungeons_history (kid, position_x, position_y, player_id)`; kolumna `attacked_at` nie występuje w INSERT i nie jest parametrem przekazywanym przez scraper.
5. Publiczne API `getDungeonsByPlayer()` odczytuje `DH.attacked_at` i zwraca je jako `attacked_at`. To dowodzi, że API wystawia wartość z bazy, ale **nie dowodzi, skąd produkcyjna baza ją otrzymuje**. W przejrzanym publicznym kodzie nie znaleziono schematu tabeli, defaultu ani triggera dla tej kolumny.
6. Testy API używają osobnej ścieżki fixture: `seedScenario()` jawnie wstawia `attacked_at` z kontrolowanego czasu scenariusza. Testy potwierdzają mapowanie kolumny w API, a nie semantykę timestampu zapisywanego przez produkcyjny scraper.

### Wniosek o czasie

Nie wolno traktować pola GGE Tracker `attacked_at` jako dokładnego czasu rozpoczęcia ataku PL1 na podstawie samej odpowiedzi API. Publiczny scraper nie przekazuje czasu zdarzenia z gry. Jeśli produkcyjna tabela nadaje kolumnie domyślny czas INSERT, byłby to co najwyżej czas rejestracji przez scraper; tej hipotezy nie potwierdzono bez schematu/triggera lub odczytu produkcyjnej bazy.

### Wniosek o ID gracza

Endpoint historii gracza oczekuje identyfikatora z trzyznakowym sufiksem kraju/serwera: `getCountryCode()` bierze ostatnie 3 znaki, a `removeCountryCode()` usuwa je przed zapytaniem do bazy. Wewnętrzny scraper czyta mapę `outer-name -> code` z `servers.xml` przez `readPublicPlayerIdCodes()`. Ten plik konfiguracyjny nie jest częścią publicznego repozytorium. `zoneId=259` z `e4k-data` nie jest potwierdzonym zamiennikiem trzyznakowego kodu. Dotychczasowe próby z ID ze Szpiegowania oraz sufiksem `259` zakończyły się odpowiednio `Player not found` i `Invalid player ID`; nie dopisano historii PL1.

### Co z tego można wykorzystać

- Odczyt GAA typu `11` może dostarczyć dla konkretnej współrzędnej target-specific `defeaterPlayerId` i pozostały cooldown. Wzrost cooldownu/zmiana defeater ID pozostaje sygnałem kandydującym do czasu walidacji kontrolowanym atakiem na produkcyjnym PL1.
- GGE Tracker wykonuje cooldown sweep tylko dla fortec, których zapisany globalny termin dostępności już minął. Jego historia może więc być próbkowana po zmianie stanu, a nie dokładnie w chwili rozpoczęcia ataku.
- `GAM` i raporty NPC w Empirenew pozostają źródłami konta zalogowanego, nie globalnym feedem serwera. Czas wyjścia ruchu i czas dostarczenia wiadomości pozostają estymacjami.
- Nie użyto cooldownu IT1/Beta do PL1. Katalog IT1 nadal dostarcza wyłącznie współrzędne.

### Źródła kodu

- `appendDungeons()`, `collectDungeonCooldowns()`, `scanDungeonCooldowns()`, `persistDungeonUpdates()`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts
- `getDungeonsByPlayer()` i odczyt `DH.attacked_at`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts
- `getCountryCode()` / `removeCountryCode()`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/helper/api-helper.ts
- `readPublicPlayerIdCodes()` z prywatnego pliku konfiguracyjnego: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/servers-file.ts
- Fixture z jawnie ustawionym `attacked_at`: https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/tests/lib/dungeon-scenario.ts

### Następny test

Na autoryzowanej sesji produkcyjnego PL1 wykonać przed i po jednym kontrolowanym ataku odczyt tej samej fortecy przez GAA: `kid/x/y`, `owner_id`, `defeaterPlayerId`, cooldown i dokładny czas lokalnego odbioru. Równolegle zebrać GAM i raport NPC z konta wykonującego atak. To pozwoli ustalić, czy GAA zmienia `defeaterPlayerId` dopiero po zwycięstwie oraz zawęzić przedział obserwacji. Dla dokładnego timestampu nadal potrzebne jest pole serwerowe albo potwierdzony schemat produkcyjnej kolumny `attacked_at`.


## 26. Czas bitwy z BLS.PS — audyt i bezpieczna estymacja, 2026-11-06

### Nowe ustalenie protokołu

Niezależna implementacja EmpireCore opisuje odpowiedź `bls` (Battle Log Short) z polem `PS` jako `seconds_since_battle`. Jej test oparty na zanonimizowanym kształcie odpowiedzi gry sprawdza `PS=678547`. To jest mocniejsza informacja o czasie niż wiek wiadomości w skrzynce, ale nadal wartość względna, nie absolutny timestamp. Ważne ograniczenie próbki upstream: zanonimizowany fixture ma `AI.AT=1` (atak NPC na zamek gracza), a nie typ 11 boss dungeon. Potwierdza więc obecność `PS` w odpowiedzi BLS dla tego rodzaju raportu, ale sam nie potwierdza, że produkcyjny PL1 zwraca `PS` także dla raportu z fortecy typu 11. W Barony pole czasu pozostaje opcjonalne i zostanie dołączone tylko wtedy, gdy odpowiedź BLS rzeczywiście je zawiera i przejdzie korelację.

Kod `ggejs`:
- `BasicMessage` wylicza `deliveryTime` jako lokalne `Date.now() - data[5] * 1000`; to wiek/dostarczenie wiadomości, nie czas rozpoczęcia ataku.
- `BasicBattleLogMessage.getBattleLog()` pobiera krótki log przez `BLS`, a następnie `BLM` i `BLD`.
- `ggejs bls.js` mapuje m.in. `MID`, `LID`, uczestników i obiekt mapy, ale nie wystawia `PS` w zwracanym obiekcie `BattleLog`. Zwykłe `message.getBattleLog()` gubi więc to pole.

### Zmiana w Empirenew

`scripts/barony-live/probe-core.mjs`:
- dodano `parseGgejsBattleLogShortResponse()`, który analizuje wyłącznie udaną odpowiedź XT `bls` (kod 0 lub 10005);
- z payloadu zachowuje wyłącznie `MID`, `LID`, `PS`, lokalny czas odbioru i opcjonalne `AI.AT/K/X/Y`; nie przechowuje surowego payloadu;
- wylicza `battle_time_estimate_utc = received_at_utc - PS`;
- do raportu NPC dołącza estymację tylko wtedy, gdy `MID` i `LID` zgadzają się z wiadomością i pełnym raportem, a jeśli BLS podał cel, zgadzają się też kraina i X/Y.

`attack_time_utc` pozostaje `null`. Pole `battle_time_estimate_utc` oznacza **szacowany czas wystąpienia bitwy**, a nie czas wysłania armii. Niepewność obejmuje opóźnienie sieci i różnicę zegara lokalnego względem serwera. Źródło jest ograniczone do raportów w skrzynce zalogowanego konta; nie jest to globalny feed PL1.

### Testy offline

Dodano testy:
- poprawne parsowanie `BLS.PS` i wyliczenie estymacji;
- odrzucenie błędnego kodu odpowiedzi, niepoprawnego JSON, brakującego/ujemnego `PS` i nieprawidłowego czasu próbki;
- korelacja `MID`, `LID` i `AI` z dokładnym celem raportu;
- odmowa dołączenia estymacji przy niezgodnym celu, identyfikatorze wiadomości lub logu.

Testy nie używają danych konta ani połączenia z grą. W tej iteracji nie wykonano live logowania do produkcyjnego PL1, więc nie ma nowego potwierdzonego zdarzenia ataku.

### Źródła

- EmpireCore — model `BattleLogShortResponse`, pole `PS`: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/src/empire_core/messages/models/battle_logs.py
- EmpireCore — test odpowiedzi BLS z `PS=678547`: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/tests/messages/test_battle_logs.py
- EmpireCore — zanonimizowany fixture BLS: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/tests/messages/battle_log_payloads.py
- ggejs — `BasicMessage.deliveryTime`: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/messages/BasicMessage.js
- ggejs — `BasicBattleLogMessage.getBattleLog()`: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/messages/BasicBattleLogMessage.js
- ggejs — parser BLS, który nie wystawia `PS`: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/commands/bls.js

### Wniosek i dalszy test

To pozwala uzyskać lepszą estymację chwili bitwy dla raportu, ale nie rozwiązuje czasu rozpoczęcia ruchu ani globalnej historii. Następny test live powinien porównać dla tej samej fortecy: `GAM` (ruch i czas podróży), `BLS.PS` (wiek bitwy), `SNE` (wiek wiadomości) oraz odczyt GAA po bitwie. Bez kontrolowanego testu na produkcyjnym PL1 nie należy podnosić `battle_time_estimate_utc` do rangi dokładnego czasu ataku.

## 27. BLM.PS jako niezależne źródło wieku bitwy i kontrola spójności z BLS — 2026-11-06

### Nowe ustalenie protokołu

Audyt modelu EmpireCore wykazał, że pole `PS` nie występuje wyłącznie w `BattleLogShortResponse` (BLS). Model `BattleLogMiddleResponse` (BLM) również definiuje `PS` jako `seconds_since_battle`. Dokumentacja modelu wskazuje dodatkowo kod klienta: `BattleLogVO.fillFromParamObject` ustawia timestamp przez `now - e.PS * 1000`. Walidator EmpireCore odwzorowuje tę samą semantykę; wartość `0` traktuje jako brak timestampu, ponieważ klient używa warunku truthy.

Kod `ggejs` potwierdza kolejność pobierania raportu:
1. `BasicBattleLogMessage.getBattleLog()` pobiera BLS dla `messageId`;
2. następnie pobiera BLM dla `battleLogId` (LID);
3. następnie pobiera BLD dla tego samego LID.

`blm.js` wysyła `{LID: battleLogId}` i dopasowuje odpowiedź po LID. W odpowiedzi BLM nie trzeba zakładać obecności MID. Probe wiąże więc BLM z MID wiadomości, której `getBattleLog()` jest aktualnie wykonywane, a następnie wymaga zgodności LID z pełnym raportem.

### Zmiana w Empirenew

Dodano `parseGgejsBattleLogMiddleTimeResponse()`:
- akceptuje wyłącznie udaną odpowiedź XT `blm` (kod 0 lub 10005);
- odczytuje wyłącznie `LID` i dodatnie `PS`;
- wiąże MID z aktywnym odczytem wiadomości skrzynki, jeśli wire response nie zawiera MID;
- jeżeli BLM zawiera MID, wymaga jego zgodności z aktywną wiadomością;
- nie zapisuje surowego payloadu.

`probe.mjs` przechwytuje BLM.PS podczas sekwencji `message.getBattleLog()` i wiąże go z bieżącym MID. `extractNpcBattleReportEvidence()` może teraz użyć BLM.PS, jeśli BLS.PS jest nieobecny, ale nadal wymaga zgodności MID, LID, krainy, typu 11, właściciela NPC, atakującego i pełnych współrzędnych z raportu.

Jeśli dostępne są oba źródła:
- porównuje estymacje BLS.PS i BLM.PS;
- przy różnicy do 15 sekund oznacza czas jako `BLS.PS+BLM.PS_cross_checked`;
- przy różnicy powyżej 15 sekund wstrzymuje timestamp i zapisuje powód odrzucenia;
- jeśli BLS.AI podaje współrzędne sprzeczne z pełnym raportem, wstrzymuje timestamp również wtedy, gdy BLM.PS jest dostępny.

Wprowadzono też korektę semantyczną: wynik używa pola `battle_time_seconds_since_battle`, nie mylącego `battle_time_seconds_since_report`. `PS=0` jest odrzucane zgodnie z zachowaniem klienta, który nie tworzy timestampu dla wartości falsy.

### Testy

Dodano testy:
- parsowania BLM.PS i powiązania z aktywnym MID;
- odrzucenia błędu XT, złego MID, złego LID, brakującego kontekstu i PS=0;
- użycia BLM.PS, gdy BLS.PS nie jest dostępny;
- korelacji obu źródeł, gdy estymacje są zgodne;
- wstrzymania czasu, gdy BLS.PS i BLM.PS różnią się o ponad 15 sekund;
- wstrzymania czasu, gdy BLS.AI wskazuje inny cel niż pełny raport.

Testy są offline i nie stanowią potwierdzenia zachowania produkcyjnego PL1. Nie wykonano logowania ani kontrolowanego ataku w tej zmianie.

### Źródła

- EmpireCore — `BattleLogShortResponse.PS` i semantyka czasu klienta: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/src/empire_core/messages/models/battle_logs.py
- EmpireCore — `BattleLogMiddleResponse.PS`: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/src/empire_core/messages/models/battle_logs.py
- EmpireCore — fixture BLS i BLM z PS: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/tests/messages/battle_log_payloads.py
- EmpireCore — test `seconds_since_battle`: https://github.com/eschnitzler/EmpireCore/blob/b3f892059501784c28b90e7413810d17ad1e22a6/tests/messages/test_battle_logs.py
- ggejs — kolejność BLS → BLM → BLD i powiązanie po LID: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/messages/BasicBattleLogMessage.js
- ggejs — żądanie i handler BLM: https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/commands/blm.js

### Ograniczenia i następny test

To poprawia pokrycie raportów, gdy BLS nie zawiera PS, i daje niezależny test spójności, jeśli obie odpowiedzi zawierają PS. Estymacja nadal opisuje czas bitwy, nie czas wysłania armii; nie jest dokładnym timestampem ataku. Raporty pozostają ograniczone do skrzynki autoryzowanego konta, nie do globalnej historii PL1.

Następny test na autoryzowanej sesji PL1 powinien zebrać BLS i BLM dla jednego raportu z fortecy typu 11 i porównać ich PS, MID/LID, AI oraz pełny `BattleLog.mapobject.position`. Bez takiego wyniku nie podnosimy tej estymacji do potwierdzonego czasu ataku.


## 28. Ścisła walidacja schematu katalogu mapowego — 2026-11-06

### Ustalenie

Przegląd bieżącego walidatora wykazał, że blokował znane nazwy pól ataku/cooldownu, ale dopuszczał nieznane dodatkowe pola w rekordzie fortecy. Nie wymagał też niepustego, unikalnego identyfikatora rekordu. Aktualny katalog został sprawdzony niezależnie: 2021 rekordów, 2021 unikalnych ID, dokładnie siedem pól w każdym rekordzie, bez dodatkowych pól.

### Poprawka

- `validateMapOnlyCatalog()` wymaga teraz dokładnie pól `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`.
- Odrzuca brakujący/pusty identyfikator oraz powtórzone ID.
- `scripts/test-baron-map-catalog.mjs` wykonuje tę samą kontrolę dla katalogu publikowanego.
- Dodano regresję dla niezatwierdzonego pola, brakującego ID i duplikatu ID.

### Zakres i ograniczenia

Zmiana dotyczy wyłącznie walidacji katalogu fortec. Nie zmienia danych, UI, mapy ani źródeł PL1. Nie wykonano live logowania do gry. Nie powstały żadne zdarzenia ataków. Wynik testów GitHub Actions dla tego commitu należy potwierdzić po zakończeniu workflow; nie traktować samego zapisu commitów jako testu.


## 29. Bezpieczna normalizacja i unikalność ID importu IT1 — 2026-11-06

### Ustalenie

Nowy ścisły walidator katalogu wymaga niepustych, unikalnych identyfikatorów. Audyt importera wykazał, że puste lub składające się z białych znaków źródłowe `id` byłyby wcześniej zapisane jako pusty identyfikator zamiast otrzymać deterministyczny fallback współrzędnych. Importer nie sprawdzał też duplikatów ID, zanim przygotował katalog do publikacji.

### Poprawka

- Normalizacja wybiera pierwsze niepuste pole spośród `id`, `dungeon_id`, `object_id`; jeśli żadne nie jest dostępne, generuje `it1-{kid}-{x}-{y}`.
- Dodano `validate_unique_ids()`; brakujące/puste lub powtórzone ID zatrzymują import przed zapisem i zachowują poprzedni katalog.
- Dodano testy dla pustego ID, przejścia na alternatywne ID oraz duplikatu ID.
- Zmiana dotyczy wyłącznie importera i testów mapy IT1; nie zmienia pól publicznych.

### Testy i ograniczenia

Commit importera uruchamia workflow importu z rzeczywistym odczytem IT1. Wynik pobrania i publikacji należy potwierdzić po zakończeniu Actions. Nie wykonano autoryzowanego logowania do gry ani testu ataku na PL1; nie zapisano zdarzeń ataków.


## 30. Weryfikacja po wdrożeniu walidatorów ID i schematu — 2026-11-06 02:13 UTC

### Import IT1

Po commitach zmian importera i testów pojawił się commit automatyczny `d36e5ae5a5f6a872c604da837101a8cd76af047b` z czasem 2026-11-06T02:13:29Z. Commit odświeżył `captured_at` w katalogu, co potwierdza, że workflow importu pobrał nowy snapshot i dotarł do kroku commitowania. Workflow wykonuje testy Python, import, walidację katalogu i plan Barony przed commitem; nie mam jednak bezpośredniego dostępu do pełnych logów runu przez dostępny interfejs GitHub Actions.

Snapshot: `2026-11-06T02:13:28.173308Z`; Piaski 671, Lód 779, Ogień 571; razem 2021. Jedna strona API. Po odczycie repozytorium uruchomiono w izolowanym harnessie JavaScript aktualny `validateMapOnlyCatalog()` i `buildScanPlan()`: 6/6 kontroli PASS (katalog bieżący, 2021/199 plan, odrzucenie dodatkowego pola, brakującego ID, duplikatu ID i pola cooldownu). 2021 współrzędnych i 2021 unikalnych ID.

### Zakres zmian

Porównanie od snapshotu 01:23:54Z do commitu po imporcie wykazuje tylko: `data/baron-fortresses.json`, `scripts/import_it1_fortresses.py`, `tests/test_import_it1_fortresses.py`, `scripts/barony-live/probe-core.mjs`, `scripts/barony-live/probe-core.test.mjs`, `scripts/test-baron-map-catalog.mjs` oraz ten dziennik. Nie zmieniono `barony.html`, `mapa-rb.html`, zakładek Mapa, Szpiegowanie ani Dodatkowe.

### Build, deployment i mobilność

Import i walidacja przed commitem zostały potwierdzone przez automatyczny commit danych. Nie udało się odczytać szczegółowego wyniku nowego workflow probe/mobilności ani nowego deploymentu Pages: dostępne wywołanie statusów commitów zwróciło pustą listę, a dostępny interfejs GitHub nie udostępnił listy runów push-triggered. Ostatni wcześniej potwierdzony test mobilny i deployment nie są dowodem wdrożenia snapshotu 02:13Z. Żaden plik UI nie został zmieniony w tej iteracji.

### PL1

Nie wykonano live logowania do produkcyjnego PL1. Dane GAA/GAM, BLS/BLM i raporty NPC pozostają ścieżkami przygotowanymi do testu na autoryzowanej sesji konta demo; nie ma nowego potwierdzonego odczytu ruchów ani raportu z produkcyjnego PL1. Nie zapisano zdarzeń ataków; `attack_time_utc` pozostaje null.


## 31. Usunięcie konfliktu równoległego importu IT1 i ponowna weryfikacja — 2026-11-06 02:53 UTC

### Przyczyna błędu importu

Log runu `42148912228` wykazał, że pobranie IT1, testy importera i walidacja katalogu przeszły poprawnie (2021 rekordów; plan 199 sektorów), ale krok commitowania zakończył się konfliktem w `data/baron-fortresses.json` podczas `git pull --rebase origin main`. Kolejny import oparty na starszym SHA zdarzenia push próbował ponownie opublikować katalog, który zdążył już zmienić inny przebieg. To nie był błąd danych ani testów — konflikt powstał przy publikacji z nieaktualnej bazy commita.

### Poprawka

Commit `5eb98af6ff7292731763c2e69fd5b4f647282220` zmienia wyłącznie:
- `.github/workflows/import-it1-fortresses.yml`: checkout jawnie używa `ref: main`, aby przebieg oczekujący w kolejce zaczynał od aktualnego HEAD, a nie od starego SHA zdarzenia push;
- `scripts/test-baron-import-workflows.mjs`: dodano regresję wymagającą checkoutu `main` i zachowania serializacji importu bez anulowania aktywnego wydawcy.

Istniejąca grupa `concurrency: empire-new-it1-map` i końcowe `git pull --rebase origin main` pozostały. Rebase nadal chroni przed zmianami, które pojawią się po checkout; poprawka usuwa typowy konflikt wynikający z kolejki i starego SHA.

### Weryfikacja po poprawce

- Probe Barony, run `42153152559`: SUCCESS. Testy Node.js: 40/40 PASS, 0 FAIL; plan: 2021 celów, 199 sektorów 100×100, 1 990 000 szacowanych pól. Kontrole klienta E4K, mobilnego UI, katalogu i publicznych endpointów zakończyły się sukcesem.
- Walidacja mapy i UI, run `42153152660`: SUCCESS.
- Import IT1, run `42153152595`: SUCCESS. Import: 2021 rekordów mapowych z jednej strony API; walidator katalogu potwierdził 2021 unikalnych współrzędnych i brak pól ataku/cooldownu/gracza/gotowości. Plan: 199 sektorów. Krok commitowania utworzył `02dc5fa21a8e33e3fb0bbd9bd50e8a33efcb8d0e` bez konfliktu rebase.
- Końcowy katalog w HEAD: `captured_at=2026-11-06T02:53:37.896885Z`; Piaski 671, Lód 779, Ogień 571; razem 2021. Schemat rekordu pozostaje dokładnie: `id,kid,kingdom,x,y,type,source_server`.
- GitHub Pages: wcześniejszy build dla commitu `5eb98af` został anulowany, gdy automatyczny import utworzył nowy commit danych; końcowy run `42153182617` dla `02dc5fa` zakończył build, deploy i report-build-status sukcesem.

### Aktualny wynik PL1

Publiczny katalog GGE Tracker nadal oznacza `E4K_PL1` jako `fortress=false` i bez zone ID/kodu; `E4K_PL1/dungeons` zwraca HTTP 400 Invalid server. `E4K_PL1_BETA` zwraca 976 rekordów, ale pozostaje osobnym serwerem i nie jest źródłem danych ataków PL1. Most zgłosił `target_connected=false`, więc żądania mapy przez most pominięto. Nie wykonano autoryzowanej sesji gry; nie uzyskano nowych ruchów GAM ani raportów BLS/BLM dla produkcyjnego PL1. Liczba nowych potwierdzonych ataków: 0; `attack_time_utc` pozostaje null.

### Zakres

Zmiany kodu dotyczyły tylko workflow importu katalogu Barony i jego testu. Automatyczny commit `02dc5fa` zmienił tylko `data/baron-fortresses.json`. Nie zmieniono `barony.html`, Mapa, Szpiegowania ani Dodatkowe. Katalog IT1 nadal dostarcza wyłącznie współrzędne; cooldown i historia IT1/Beta nie są przenoszone do PL1.


## 32. Weryfikacja pełnych logów importu, probe i deploymentu — 2026-11-06

### Aktualny stan gałęzi

Najnowszy sprawdzony commit przed tą notatką: `cf6b45357a6a319a30eaa1cba16f15aebf1ba844` (2026-11-06 03:50:25 UTC), tytuł: `fix(barony): correct pre-request evidence output formatting`.

Zmienił wyłącznie:
- `scripts/barony-live/probe-core.mjs`: usunięto nieużywaną zmienną `allBatches`;
- `scripts/barony-live/probe.mjs`: rozdzielono deklaracje i przypisania, które wcześniej zawierały przypadkowy dosłowny zapis `\\n` w kodzie.

To poprawka formatu/składni probe, nie zmiana semantyki historii ataków. Nie mam jeszcze potwierdzonego wyniku nowego Actions uruchomionego po commicie `cf6b453`. Workflow `.github/workflows/baron-pl1-probe.yml` ma kontrolę `node --check scripts/barony-live/probe.mjs` oraz testy Node; jego filtr push obejmuje `scripts/barony-live/**` i ten dziennik. Nie przypisuję poprawce statusu PASS przed odczytem nowego runu.

### Import IT1 — pełny log runu 42153152595

Job `127680952186`, `import-map`: SUCCESS.

Log potwierdza:
- testy Python: 27/27 PASS;
- rzeczywiste pobranie z GGE Tracker: `Imported 2021 map-only IT1 records across 1 page(s)`;
- walidacja katalogu: `PASS (2021 unique coordinates; no attack, cooldown, player or readiness fields)`;
- plan: 2021 celów, 199 sektorów, 1 990 000 szacowanych pól;
- commit danych: `02dc5fa21a8e33e3fb0bbd9bd50e8a33efcb8d0e`, push na `main` bez konfliktu.

Snapshot w aktualnym pliku: `2026-11-06T02:53:37.896885+00:00`; Piaski 671, Lód 779, Ogień 571. Niezależna kontrola pliku z repo: 2021 rekordów, 2021 unikalnych ID, 2021 unikalnych współrzędnych; dokładnie siedem pól rekordu: `id,kid,kingdom,x,y,type,source_server`.

### Diagnostyka produkcyjnego PL1 — pełny log runu 42153152559

Job `127680952276`, `probe`: SUCCESS (testy i diagnostyka publicznych endpointów; bez logowania do konta gry).

Potwierdzone wyniki:
- katalog serwerów: `E4K_PL1 enabled=true, fortress=false`; `E4K_PL1_BETA enabled=true, fortress=true`;
- `/dungeons` dla `IT1`: HTTP 200; dla `E4K_PL1`: HTTP 400 Invalid server; dla `E4K_PL1_BETA`: HTTP 200;
- Beta: 976 rekordów, 976/976 współrzędnych pokrywa się z IT1; to nadal odrębny serwer;
- pięć przykładowych historii Beta: 5/5 niepustych, 7717 rekordów łącznie; wyłącznie diagnostyka Beta, bez importu do PL1;
- trzy próbki graczy z migawki produkcyjnego PL1: 3/3 nierozpoznane (`Player not found`), historie HTTP 400 `Invalid player ID`;
- próba sufiksu zoneId 259: 3/3 HTTP 400 `Invalid player ID`;
- katalog produkcyjnego PL1 nie podał trzycyfrowego kodu routingu;
- most: `target_connected=false`; komendy mapy przez most pominięto.

Wynik ten nie potwierdza globalnego feedu ruchów ani historii ataków produkcyjnego PL1. Nie wykonano logowania demo; nie otrzymano nowych raportów BLS/BLM ani ruchów GAM z produkcyjnego PL1. Liczba nowych potwierdzonych zdarzeń: 0; `attack_time_utc` pozostaje null.

### Test mobilny i publikacja

- Run `42153152660`: job `validate` SUCCESS; krok `Test Barony mobile layout and local-history labels` SUCCESS; walidacja katalogu PASS.
- Run `42153182617`: build SUCCESS, deploy SUCCESS, report-build-status SUCCESS.
- Deployment dotyczy commitu katalogu `02dc5fa`; potwierdza publikację snapshotu z 02:53:37Z.
- Nie wykonano testu na fizycznym telefonie; test mobilny jest kontrolą statycznego interfejsu.

### Zakres ochrony

Zmiany kodu w commicie `cf6b453` dotyczą wyłącznie `scripts/barony-live/probe-core.mjs` i `scripts/barony-live/probe.mjs`. Import zmienił wyłącznie katalog danych. Nie zmieniono `barony.html`, `mapa-rb.html`, zakładek Mapa, Szpiegowanie ani Dodatkowe.

### Następny krok

1. Potwierdzić wynik workflow probe po commicie `cf6b453` (w szczególności `node --check` i pełne `node --test`).
2. Uzyskać autoryzowaną sesję konta demo na produkcyjnym E4K PL1; poświadczenia wyłącznie lokalnie przez `E4K_USERNAME` i `E4K_PASSWORD`, nigdy w czacie, repozytorium ani Actions.
3. Wykonać pasywny odczyt kilku fortec i skrzynki raportów, a następnie porównać dane z ręcznie przeprowadzonym testem operatora.
4. Nie tworzyć historii automatycznej, dopóki tożsamość atakującego i semantyka czasu nie zostaną potwierdzone na rzeczywistym PL1.


## 33. Import fail-closed bez paginacji i świeży snapshot IT1 — 2026-11-06 04:05 UTC

### Zmiana bezpieczeństwa importera

Wcześniejszy importer dopuszczał odpowiedź bez obiektu pagination, uznając krótką stronę za kompletną. Sam rozmiar odpowiedzi nie dowodzi jednak, że API zwróciło wszystkie rekordy.

Wprowadzono:
- brak pagination lub brak wymaganych pól paginacji powoduje teraz błąd i zachowanie poprzedniego katalogu;
- usunięto ścieżkę kończącą skan tylko dlatego, że liczba rekordów jest mniejsza od PAGE_SIZE;
- test test_rejects_payload_without_pagination_metadata sprawdza odrzucenie zarówno obiektu bez paginacji, jak i surowej listy;
- test scripts/test-baron-import-workflows.mjs wymaga, aby zmiany importera i jego testów znajdowały się w filtrze push kanonicznego workflow.

Zmiany:
- importer: f1c35307dce75ee9bdc20a74ca4878dd0ce1b45a;
- test importera: 88c744c80deac12f3f84803a6e7054ba95efbd2c;
- test triggerów workflow: eae7e75b8a04d8827c7c36e9b928815104913797.

### Rzeczywisty import po zmianie

Po zmianach pojawiły się automatyczne commity katalogu:
- 7ddd7f2e5733f1ebd5dd8ff78a8026e5452bda76;
- 9b4ae82ee4e374f804bcd5750c166412673602e0;
- najnowszy: 5300025396ff35c1a91b6b23811dd555709612c6.

Najnowszy commit zmienił wyłącznie data/baron-fortresses.json i został utworzony 2026-11-06 04:05:24 UTC. Automatyczny commit jest dowodem, że workflow dotarł do kroku zapisu po testach i walidacji; pełny log tego konkretnego runu nie był dostępny w tym odczycie, więc nie podaję niezweryfikowanej liczby testów.

Snapshot w aktualnym katalogu: 2026-11-06T04:05:23.468562Z.
- Piaski 671, Lód 779, Ogień 571;
- razem 2021;
- jedna strona API;
- 2021 unikalnych ID i 2021 unikalnych współrzędnych;
- dokładnie siedem pól rekordu: id,kid,kingdom,x,y,type,source_server;
- 0 pól cooldownu, gotowości, gracza lub historii ataków.

Porównanie zbioru współrzędnych ze snapshotem 02:53:37Z: 0 dodanych i 0 usuniętych. Zmienił się czas pobrania, nie zawartość mapy.

### Kontrole wykonane po zmianie

Weryfikacja aktualnych plików i katalogu w repozytorium: 9/9 kontroli PASS:
1. workflow ma filtr push dla importera;
2. workflow ma filtr push dla testów importera;
3. importer odrzuca brak paginacji;
4. usunięto fallback krótkiej strony;
5. test braku paginacji jest obecny;
6. rekord zachowuje zatwierdzony schemat;
7. liczba rekordów to 2021;
8. współrzędne są unikalne;
9. brak dynamicznych pól w rekordach.

To kontrole źródeł i danych wykonane w odczycie repozytorium, a nie substytut pełnego wyniku python -m unittest. Automatyczny commit potwierdza przejście bramek workflow przed zapisem, ale szczegółowe logi ostatniego runu trzeba jeszcze pobrać.

### PL1, mobilność i deployment

W tej iteracji nie wykonano autoryzowanego logowania do produkcyjnego PL1. Ostatnie szczegółowe publiczne wyniki pozostają takie jak w sekcji 32: produkcyjny PL1 jest odrzucany przez GGE Tracker jako nieobsługiwany dla /dungeons, Beta jest osobnym serwerem, a most PL1 nie ma potwierdzonego połączenia. Nie zapisano ataków; attack_time_utc pozostaje null.

Ostatni potwierdzony deployment Pages to run 42153182617 dla snapshotu commitu 02dc5fa (02:53:37Z). Nowy snapshot 5300025 powstał później; nie mam jeszcze potwierdzonego wyniku nowego build/deploy dla niego. Ostatni potwierdzony test mobilny to run 42153152660; nie jest dowodem testu fizycznego telefonu.

Najnowsza poprawka składni probe cf6b453 oraz nowe zmiany importera powinny uruchomić odpowiednie workflow na podstawie filtrów push. Nie przypisuję im statusu PASS bez odczytu konkretnych logów.

### Zakres

Zmiany obejmują tylko importer IT1, testy importera, test kontroli workflow, katalog danych i ten dziennik. Nie zmieniono barony.html, mapa-rb.html, zakładek Mapa, Szpiegowanie ani Dodatkowe.


## 34. Końcowe wyniki Actions po imporcie 04:05Z — 2026-11-06 04:07 UTC

Ta sekcja uzupełnia i zastępuje oczekujące statusy build/deployment zapisane w sekcji 33.

### Potwierdzone workflow

- Import IT1, run 42160358338: SUCCESS. Job import-map 127704345779. Log: 27 testów Python, wynik OK; rzeczywisty import 2021 rekordów z jednej strony API; walidacja katalogu PASS; plan 2021 celów / 199 sektorów / 1 990 000 pól; commit katalogu został utworzony.
- Walidacja mobilna i katalogu, run 42160358384: SUCCESS. Log potwierdza viewport, cele dotykowe 44 px, focus states, etykiety lokalnej historii i rozdzielenie evidence; katalog 2021 współrzędnych PASS.
- Probe PL1, run 42160472523: SUCCESS. 13/13 testów Python probe; Node syntax checks zakończone sukcesem; testy rdzenia Node 41/41 PASS, 0 FAIL; test pinned ggejs/e4k-data i mapy PASS; test mobilny PASS; publiczna diagnostyka endpointów zakończyła się bez błędu workflow.
- Pages, run 42160472469: SUCCESS. Build, report-build-status i deploy zakończone sukcesem. Deploy log: Pages reported success; environment URL https://marwlo-ops.github.io/Empirenew/. Wersja wdrożona: commit 9b20b83bd50887975924e3024ce66a643b921ef5.

### Interpretacja wyników PL1

Sukces workflow oznacza, że diagnostyka i testy wykonały się poprawnie, nie że produkcyjny PL1 zaczął udostępniać historię ataków. Log probe nadal potwierdza:
- E4K_PL1 /dungeons: HTTP 400 Invalid server;
- E4K_PL1_BETA /dungeons: HTTP 200, 976 rekordów; Beta pozostaje odrębnym serwerem;
- 3/3 produkcyjne próbki historii graczy: Player not found / Invalid player ID;
- most: target_connected=false; komendy mapy przez most pominięto.

Nie było autoryzowanej sesji demo ani nowych raportów BLS/BLM/GAM z produkcyjnego PL1. Liczba nowych potwierdzonych zdarzeń ataków: 0. Nie zapisano fikcyjnych rekordów.

### Stan końcowy tej iteracji

- Mapa IT1: świeży snapshot 2026-11-06T04:05:23.468562Z, 2021 rekordów, 0 duplikatów, wyłącznie siedem pól mapowych.
- Importer: brak metadanych paginacji zatrzymuje import i zachowuje poprzedni katalog.
- Testy: 27 testów importera, 13 testów lokalnego probe, 41 testów Node core, test mobilny i walidacja katalogu — wszystkie potwierdzone w runach powyżej.
- Deployment: najnowszy potwierdzony Pages build/deploy SUCCESS dla commitu 9b20b83.
- Ochrona zakresu: bez zmian w barony.html, mapa-rb.html, Mapa, Szpiegowanie i Dodatkowe.

Następny krok nadal wymaga konta demo na produkcyjnym PL1 i lokalnej, autoryzowanej sesji. Poświadczenia nie mogą trafić do czatu, repozytorium ani GitHub Actions.

## 35. Ścisła walidacja pola PS w BLS/BLM — 2026-11-06 05:38 UTC

### Weryfikacja semantyki upstream

W przypiętym źródle EmpireCore (`b3f892059501784c28b90e7413810d17ad1e22a6`) modele `BattleLogShortResponse` i `BattleLogMiddleResponse` opisują `PS` jako sekundy od bitwy; typ pola to `int | float | None`. Walidator odwzorowuje zachowanie klienta: `now - PS * 1000`. Dlatego poprawna walidacja nie może wymuszać wyłącznie liczby całkowitej — wartości ułamkowe są dopuszczone przez model upstream.

Źródło: `src/empire_core/messages/models/battle_logs.py`, pola `seconds_since_battle` i walidator `_seconds`.

### Błąd wykryty w probe

Wcześniejsze parsowanie wykonywało bezwarunkowe `Number(payload.PS)`. W JavaScript oznacza to m.in.:
- `true` → `1`;
- `[120]` → `120`.

Takie wartości nie są poprawnym typem pola protokołu i mogły wytworzyć syntetyczny wiek bitwy mimo wadliwego payloadu.

### Poprawka

- BLS i BLM akceptują teraz wyłącznie wartość JSON typu number albo niepusty string liczbowy;
- nadal wymagają wartości skończonej, dodatniej i nieprzekraczającej bezpiecznego zakresu;
- nie wymuszają całkowitości, zgodnie z typem upstream;
- walidacja kandydata czasu nie wykonuje już konwersji typu przez `Number()` — przyjmuje wyłącznie liczbę zwróconą przez parser wire;
- testy obejmują boolean, array, object oraz prawidłowy string liczbowy.

### Ograniczenia

To zabezpieczenie poprawia walidację formatu, ale nie potwierdza, że BLS/BLM z produkcyjnego PL1 zawierają PS dla fortec typu 11. Nie wykonano sesji live; brak nowych rekordów ataków PL1. `attack_time_utc` pozostaje `null`, ponieważ PS opisuje wiek bitwy, a nie moment wysłania armii.

## 36. Pochodzenie attacked_at w GGE Tracker — audyt ścieżki zapisu

### Co wynika z publicznego scrapera

W przypiętym commicie GGE Tracker `7d620820a76cde4176c752f6972ce6f0c9ad7ab1` ścieżka `updateDungeonsList()` wybiera z tabeli `dungeons` tylko pozycje z `global_available_at <= NOW()`, następnie odświeża ich mały sektor mapy przez GAA. `getCorrespondingSquare()` używa kroku 12 i odstępu 13.

`collectDungeonCooldowns()` odczytuje `dungeon[5]` jako pozostały cooldown, a następnie wylicza `global_available_at = currentTime + remainingCooldown24h`. `persistDungeonUpdates()` aktualizuje `dungeons.global_available_at`, ale w `INSERT INTO dungeons_history` przekazuje tylko `kid`, `position_x`, `position_y` i `player_id` — nie przekazuje `attacked_at`.

Publiczna trasa API odczytuje `attacked_at` z historii i zwraca je jako `last_attack`. Publiczny kod nie zawiera schematu produkcyjnej tabeli `dungeons_history` ani definicji triggera/defaultu dla `attacked_at`. Z tego powodu nie da się na podstawie samego repozytorium udowodnić, czy wartość jest ustawiana przez `DEFAULT NOW()`, trigger, czy inną warstwę bazy.

### Nowy test diagnostyczny

Do `scripts/probe-baron-pl1.js` dodano read-only probe `tracker-attacked-at-provenance`. Dla `E4K_PL1_BETA` i `IT1` pobiera niewielką próbkę z filtrem `filterByAttackCooldown=3` i porównuje:
- `last_attack`;
- `global_available_at`;
- różnicę `global_available_at - last_attack` w sekundach;
- `available_duration_seconds` i `total_attack_count`.

Jeżeli różnica będzie bliska 86 400 sekund, będzie to zgodne z hipotezą, że `last_attack` reprezentuje chwilę ataku wyprowadzoną z 24-godzinnego cooldownu. Jeżeli będzie zbliżona do pozostałego cooldownu/krótkiego czasu skanowania, będzie zgodna z hipotezą, że `attacked_at` oznacza czas zapisu/obserwacji. Sam wynik próby nie zostanie użyty do PL1; jest wyłącznie audytem semantyki API dla wymienionych serwerów.

### Kontrola kolizji skanera

Na katalogu współrzędnych IT1 zapisanym `2026-11-06T04:05:23.468Z` policzono komórki skanera 13×13 (kid, floor(x/13), floor(y/13)): 2021 fortec zajmuje 2021 różnych komórek; nie ma kolizji dwóch fortec w tej samej komórce. To ogranicza ryzyko wielokrotnego zapisu tej samej fortecy przez skanowanie wspólnego sektora dla obecnego katalogu, ale nie dowodzi pochodzenia `attacked_at`.

### Ograniczenia i decyzja

Do czasu uzyskania próbki API z porównaniem obu timestampów i potwierdzenia schematu DB, `attacked_at` nie jest traktowane jako dokładny czas ataku PL1. `E4K_PL1` nadal jest odrzucane przez publiczne API jako Invalid server; Beta i IT1 pozostają osobnymi źródłami diagnostycznymi. Żadne ich cooldowny, historie ani timestampy nie są kopiowane do PL1.

## 37. Wynik porównania last_attack z global_available_at — 2026-11-06 04:47 UTC

Uruchomiono nowy read-only probe `tracker-attacked-at-provenance` w workflow `42164509564`. Dla obu serwerów użyto `filterByAttackCooldown=3` (pozycje, których globalny cooldown kończył się w ciągu godziny), po 8 rekordów na serwer. Żaden z tych rekordów nie został zapisany jako PL1.

### Wyniki

| Serwer diagnostyczny | Liczba próbek | `global_available_at - last_attack` | Odchylenie od 24 h |
|---|---:|---:|---:|
| E4K_PL1_BETA | 8 | 86 282–86 383 s | 17–118 s poniżej 86 400 s |
| IT1 | 8 | 86 296–86 373 s | 27–104 s poniżej 86 400 s |
| Łącznie | 16 | 86 282–86 383 s | średnio 57,9 s poniżej 86 400 s; mediana 86 353 s |

Wszystkie 16 próbek miały `global_available_at - last_attack` bliskie 24 godzinom, mimo że endpoint był filtrowany do cooldownów kończących się w ciągu jednej godziny. Gdyby `last_attack` było zwykłym czasem zapisu/obserwacji, różnica byłaby zbliżona do pozostałego cooldownu, a nie do pełnych 24 godzin.

### Wniosek z testu

Empiryczny wynik silnie wspiera hipotezę, że `last_attack` jest wyprowadzany z 24-godzinnego globalnego cooldownu (np. `global_available_at - 24h`) i jest przybliżeniem chwili ataku, a nie zwykłym czasem inserta. Różnica 17–118 s może wynikać z cyklu odczytu, opóźnienia i zaokrągleń. Nie jest to dowód na dokładny timestamp serwerowy: publiczny schemat bazy/trigger nadal nie jest dostępny, a scraper nie przekazuje `attacked_at` w SQL.

### Konsekwencja dla Barony

- `last_attack` z GGE Tracker nie powinien być opisywany jako dokładny czas serwerowy; jeśli kiedyś zostanie udostępniony dla PL1, należy go oznaczać jako `cooldown_derived_estimate` i zachować obserwację/czas skanu jako osobne pola.
- Nie wolno przenosić timestampów ani cooldownów z Beta/IT1 do PL1. Zgodność współrzędnych nie oznacza zgodności stanu ani historii.
- Produkcyjny `E4K_PL1` nadal zwraca `Invalid server`; most PL1 nadal `target_connected=false`. W tej iteracji nie uzyskano nowego ataku PL1.

Workflow i surowe próbki: `42164509564` (log zawiera 8 rekordów Beta i 8 IT1).

## 38. Łączenie sygnałów GAA tylko dla tego samego celu

Przegląd `compareObservations()` ujawnił, że poprzednia implementacja porównywała dwa poprawne wiersze, ale nie sprawdzała jawnie, czy obie obserwacje dotyczą tych samych współrzędnych. Dodatkowo zwracała osobne sygnały dla zmiany `defeaterPlayerId` i rozpoczęcia cooldownu.

Poprawka w `probe-core.mjs`:
- porównuje KID/X/Y oraz, jeśli dostępne, `area_type` i oczekiwany owner NPC;
- odrzuca próbki z nieprawidłowym czasem lub czasem nie rosnącym;
- gdy ten sam cel przechodzi z `cooldown_active=false` na `true` i ma dodatni `defeaterPlayerId`, zwraca jeden łączny sygnał `target_attack_transition_candidate` z dwoma polami źródłowymi;
- obsługuje ponowną wygraną tego samego gracza (ID nie musi się zmienić, jeśli cooldown rozpoczął się ponownie);
- pojedyncza zmiana ID albo sam cooldown pozostają osobnymi, słabszymi sygnałami `candidate`;
- `attack_time_utc` pozostaje `null`; jedyny czas to przedział między dwiema obserwacjami.

To nie zapisuje ani nie potwierdza ataku produkcyjnego. Wymaga dwóch poprawnych odczytów GAA tego samego celu z autoryzowanej sesji PL1; raport walki nadal jest potrzebny do niezależnego potwierdzenia atakującego i bitwy.


## 39. Bieżący audyt repozytorium, Actions i produkcyjnego PL1 — 2026-11-06 05:37 UTC

### Stan gałęzi i katalogu IT1

- Najnowszy odczyt historii commitów wskazał HEAD `b1fbf5cd1f2ae2ed66fe6860a1b885f815f07e6e` (`chore: publish latest tracker snapshots`, 05:29:27Z).
- Plik `data/baron-fortresses.json` nie zmienił się w tym commicie; jego blob SHA to `dfc9b1152a3c1a21a5ca53ed37a9132ec2bfa177`.
- Aktualny snapshot mapy nadal ma `captured_at=2026-11-06T04:05:23.468562Z`; nie oznaczamy go jako nowego pobrania z 05:37Z.
- Dane: Piaski 671, Lód 779, Ogień 571, razem 2021.
- `pages_read=1`, `complete=true`, 2021 unikalnych ID, 2021 unikalnych współrzędnych.
- Każdy rekord ma dokładnie: `id,kid,kingdom,x,y,type,source_server`; 0 niezatwierdzonych pól, w tym cooldownu, gotowości, gracza i historii ataków.
- Walidacja aktualnego pliku wykonana bezpośrednio po pobraniu z repozytorium: 2021 rekordów, 2021 unikalnych ID, 2021 unikalnych kluczy KID/X/Y, 0 rekordów z innym zestawem kluczy.

### Import i harmonogram

- Kanoniczny workflow: `.github/workflows/import-it1-fortresses.yml`.
- Harmonogram: `17 */6 * * *`; dostępne są również `workflow_dispatch` oraz push do importera, testów i definicji workflow.
- Ostatni potwierdzony import: run `42160358338`, job `127704345779`, SUCCESS, 2026-11-06 04:05Z.
- Log importu: 27 testów Python, `OK`; rzeczywisty odczyt 2021 rekordów z jednej strony API; walidacja katalogu PASS; plan 2021 celów, 199 sektorów, 1 990 000 potencjalnych pól.
- W tym audycie nie uruchomiono kolejnego importu; następny zaplanowany termin z cron to 10:17 UTC. Nie przypisujemy więc snapshotowi 04:05 nowszego czasu pobrania.

### Najnowszy probe PL1

Run `42168458129`, job `127730383666`, zakończony SUCCESS o 05:26Z.

Testy i walidacje:
- 13/13 testów Python probe PASS;
- 47/47 testów Node `probe-core.test.mjs` PASS, 0 FAIL;
- `node --check` modułów probe PASS;
- plan Barony: 2021 celów / 199 sektorów / 1 990 000 pól;
- kontrola mobilna: viewport, cele dotykowe 44 px, focus states, etykiety lokalnej historii i rozdzielenie evidence PASS;
- walidacja katalogu IT1 PASS: 2021 unikalnych współrzędnych, bez pól ataku/cooldownu/gracza/gotowości.

### Odczyt publicznego katalogu i ograniczenia PL1

- Przypięte zależności `ggejs 2.2.0` i `e4k-data 4.144.21-788.RC.3` wskazują produkcyjną instancję `EmpirefourkingdomsExGG_3`, host `e4k-live-pl1-game.goodgamestudios.com`, instance 3, zoneId 259, locale `generic_country_PL`, transport TCP. To potwierdza routing klienta, nie dostępność danych przez publiczny tracker.
- Katalog serwerów GGE Tracker: `E4K_PL1 enabled=true, fortress=false`; `E4K_PL1_BETA enabled=true, fortress=true`.
- `/dungeons`: `E4K_PL1` HTTP 400 `Invalid server`; aliasy produkcyjnego zone `EmpirefourkingdomsExGG_3` i `EmpirefourkingdomsExGG2_3` również HTTP 400.
- `E4K_PL1_BETA`: HTTP 200, 976 rekordów. To odrębny serwer; jego 976 współrzędnych pokrywa się z IT1, ale nie potwierdza historii produkcyjnego PL1.
- `IT1`: HTTP 200, 2021 rekordów.
- Pięć historii graczy Beta zwróciło łącznie 7750 rekordów; pozostają wyłącznie diagnostyką Beta i nie są kopiowane do PL1.
- Trzy próbki historii produkcyjnego PL1: 3/3 `Player not found` / `Invalid player ID`; próba sufiksu zoneId 259 również 3/3 HTTP 400.
- Publiczny most: HTTP 200, ale `target_connected=false`; komendy mapy przez most zostały pominięte.
- Nie wykonano autoryzowanej sesji konta demo. CI nie pobrało ruchów GAM ani raportów z prywatnej skrzynki PL1.

### Przejściowy błąd testów i naprawa

Run `42167916190` (05:21:11Z) zakończył się błędem: 4 testy Node nie odpowiadały już nowej semantyce łączenia obserwacji tego samego celu. Kolejne przebiegi po aktualizacji logiki i asercji zakończyły się SUCCESS; najnowszy `42168458129` potwierdza 47/47 PASS. Nie pozostawiono tego błędu jako aktualnego stanu.

### Build, deployment i test mobilny

- Run walidacji mobilnej/katalogu `42160358384`: SUCCESS; log potwierdza cele 44 px i walidację 2021 współrzędnych.
- Najnowszy Pages run `42168718703`, commit `b1fbf5c`: build SUCCESS, deploy SUCCESS, report-build-status SUCCESS.
- Build artifact zawierał `data/baron-fortresses.json`, `scripts/import_it1_fortresses.py` oraz moduły probe.
- Deploy log potwierdził `Reported success!` i URL środowiska `https://marwlo-ops.github.io/Empirenew/`.
- Nie wykonano testu na fizycznym telefonie; wynik mobilny dotyczy statycznych kontroli CI.

### Zakres i inne harmonogramy

W ramach prac fortecowych nie edytowano zakładek Mapa, Szpiegowanie ani Dodatkowe, plików `barony.html` i `mapa-rb.html`, ani plików historii innych modułów. Niezależny, istniejący workflow `Empirenew location tracker` (`42168616146`) uruchomił się według własnego harmonogramu i aktualizował osobne pliki historii lokalizacji/outpostów/server-intel. Nie zmieniano jego konfiguracji ani tych danych w ramach prac fortecowych.

### Decyzja o historii ataków

- `last_attack` z Beta/IT1 nadal jest wyłącznie estymacją pochodzącą z cooldownu 24 h; nie wolno kopiować tych rekordów do produkcyjnego PL1.
- BLS/BLM `PS` może oszacować wiek bitwy, gdy raport, MID/LID, cel i odpowiedzi są skorelowane; nie jest to czas wysłania armii.
- `attack_time_utc` pozostaje `null`; nie dodano żadnych zdarzeń PL1.
- Sygnały GAA po dwóch obserwacjach tego samego celu pozostają kandydatami ograniczonymi przedziałem obserwacji, dopóki nie zostaną zweryfikowane na autoryzowanej sesji produkcyjnego PL1 i niezależnym raporcie NPC.

### Następny krok

1. Poczekać na kolejny zaplanowany import IT1 lub uruchomić go przez `workflow_dispatch` w GitHub; po nim zweryfikować nowy timestamp, liczbę stron, rekordów i deployment.
2. Uzyskać lokalny, autoryzowany odczyt konta demo na produkcyjnym PL1; poświadczenia wyłącznie w lokalnych zmiennych środowiskowych.
3. Sprawdzić pasywnie próbkę mapy, GAM i raporty NPC, a następnie porównać dwie obserwacje tych samych współrzędnych.
4. Nie publikować automatycznej historii, dopóki tożsamość atakującego i semantyka czasu nie zostaną potwierdzone.


## 40. Świeży import 06:11Z i diagnostyka mostu po połączeniu — 2026-11-06 06:13 UTC

### Świeży import IT1 — potwierdzony

Po dodaniu testu zakresów paginacji uruchomił się kanoniczny workflow `Refresh IT1 fortress map catalog`:

- run `42172899967`, job `127744619369`: SUCCESS;
- testy importera: 28, wynik `OK`;
- rzeczywisty import: 2021 rekordów mapowych z jednej strony GGE Tracker IT1;
- walidacja katalogu: PASS;
- plan: 2021 celów, 199 sektorów 100×100, 1 990 000 potencjalnych pól;
- commit importu: `dd661ae57ffa0452f048df78bea2b723b2127a47`.

Nowy snapshot:
- `captured_at=2026-11-06T06:11:51.997482Z`;
- Piaski 671, Lód 779, Ogień 571;
- razem 2021 rekordów;
- 2021 unikalnych ID i 2021 unikalnych współrzędnych;
- dokładnie siedem pól: `id,kid,kingdom,x,y,type,source_server`;
- brak cooldownu, gotowości, gracza i historii ataków.

Zbiór współrzędnych pozostał taki sam jak w poprzednim snapshotcie; zmienił się czas pobrania. Nowy blob katalogu: `76abf015f4432374b0dc33a9d8e3e31329e89601`.

### Test mobilny, probe i Pages

Run `42172900111` (job `127744619530`):
- 13/13 testów Python PASS;
- 44/44 testów Node PASS, 0 FAIL;
- test mobilnego viewportu, 44 px celów dotykowych, focus states i etykiet historii lokalnej PASS;
- walidacja katalogu IT1 PASS: 2021 unikalnych współrzędnych, bez dynamicznych pól.

Import commit uruchomił Pages run `42172918789`:
- build SUCCESS;
- artifact `github-pages.zip` zawierał `data/baron-fortresses.json`;
- deploy SUCCESS;
- log: `Reported success!`;
- environment: `https://marwlo-ops.github.io/Empirenew/`.

To potwierdza wdrożenie snapshotu z 06:11:51Z. Test mobilny pozostaje testem statycznym CI, nie testem na fizycznym telefonie.

### Nowe ustalenie: most PL1 chwilowo połączył się, ale komendy nie zwróciły danych

W probe run `42172373205` status mostu o 06:07:05Z zwrócił `target_connected=true`. Wykonane wtedy, tylko do odczytu, próby:
- GAM z nagłówkiem `M:{}`: HTTP 400 `Invalid command or headers`;
- GAM z nagłówkiem `O:{}`: HTTP 400 `Invalid command or headers`;
- GAA z `KID:1`: HTTP 400 `Invalid command or headers`.

Następny probe `42172692175` i kolejny `42172900111` odczytały już `target_connected=false`; po poprawce nie wysłano więc kolejnego GAM. Połączenie mostu jest niestabilne i nie wolno traktować samego statusu `true` jako potwierdzenia poprawnego odczytu danych.

### Audyt źródła mostu i poprawka naszego probe

Przejrzałem publiczny kod mostu `danadum/empire-api` (commit źródłowy `dc2e8c459a87d13a30d423b03bbbd8774f7f7b3d`):
- trasa `/:server/:command/:headers` parsuje segment headers jako JSON i wysyła komendę;
- odpowiedź jest dopasowywana przez `waitForJsonResponse` z timeoutem 1000 ms;
- każdy wyjątek, również timeout lub brak dopasowania odpowiedzi, jest zwracany jako ten sam HTTP 400 `Invalid command or headers`;
- `data/commands.json` nie zawiera mapowania odpowiedzi dla GAM ani GAA; dla nieznanych komend most dopasowuje odpowiedź do wszystkich przekazanych pól żądania.

Wniosek: wcześniejszy HTTP 400 nie rozstrzyga, czy serwer odrzucił komendę, czy most nie dopasował odpowiedzi w sekundowym oknie. Dla GAM tablice M/O są zmienne i mogą być puste, więc oczekiwanie na niepusty fragment M albo O mogło samo powodować timeout. Dla GAA żądanie obszaru ma więcej parametrów niż sam KID, a most nie ma dedykowanego mapowania odpowiedzi, dlatego nie wysyłamy go dalej przez ten niedopasowany adapter.

Poprawka w naszym `scripts/probe-baron-pl1.js`, commit `462aeece2d030d8c6611776f9b60eb9e0f82aadf`:
- GAM jest teraz wysyłany z pustym obiektem `{}`, aby nie wymagać niepustej tablicy M/O do dopasowania;
- GAA jest jawnie oznaczane jako `skipped` z powodem braku mapowania odpowiedzi w adapterze;
- nie dodano żadnych zapisów zdarzeń ani dodatkowych komend modyfikujących stan gry.

Ta zmiana przeszła testy i build, ale nie została jeszcze potwierdzona odpowiedzią GAM z live mostu: najnowszy run miał `target_connected=false`, więc request został bezpiecznie pominięty.

Źródła audytu adaptera:
- `https://github.com/danadum/empire-api/blob/main/app.js`;
- `https://github.com/danadum/empire-api/blob/main/data/commands.json`;
- `https://github.com/danadum/empire-api/blob/main/utils/ws/baseSocket.js`.

### PL1 — nadal brak potwierdzonej historii

- GGE Tracker `E4K_PL1`: HTTP 400 `Invalid server`;
- alias produkcyjny `EmpirefourkingdomsExGG_3`: HTTP 400;
- `E4K_PL1_BETA`: HTTP 200, 976 rekordów, ale to osobny serwer;
- IT1: HTTP 200, 2021 rekordów;
- próbki historii produkcyjnego PL1: 3/3 `Player not found` / `Invalid player ID`;
- most: status zmieniał się między `true` i `false`; brak udanej odpowiedzi GAM/GAA;
- nie wykonano autoryzowanego logowania kontem demo ani odczytu jego skrzynki raportów.

Nie zapisano żadnych zdarzeń ataków PL1. `attack_time_utc` pozostaje `null`. Estymaty z cooldownu Beta/IT1 nie są kopiowane do PL1.

### Zakres

Zmiany tej iteracji ograniczono do:
- testu zakresów metadanych paginacji;
- bezpiecznego sposobu odczytu GAM przez most i jawnego pominięcia GAA;
- świeżego map-only snapshotu IT1;
- dziennika badań.

Nie edytowano zakładek Mapa, Szpiegowanie ani Dodatkowe, plików `barony.html` i `mapa-rb.html`, ani danych ich historii.

### Następny krok

1. Przy kolejnym potwierdzonym `target_connected=true` sprawdzić, czy GAM `{}` zwróci HTTP 200 i prawidłową odpowiedź; nie uznawać pustej odpowiedzi ani timeoutu za brak ruchów.
2. Dla GAA potrzebny jest adapter z mapowaniem odpowiedzi (np. KID i identyfikator obszaru) albo autoryzowana lokalna sesja ggejs; nie wysyłać kolejnych niedopasowanych żądań przez obecny most.
3. Wykonać lokalny, autoryzowany odczyt konta demo na produkcyjnym PL1, z poświadczeniami wyłącznie w zmiennych środowiskowych.
4. Następnie skorelować dokładny cel, ID atakującego, raport NPC oraz BLS/BLM PS; czas bitwy nadal odróżniać od czasu wysłania armii.

## 41. Integracja ścisłej walidacji obserwacji GAA — 2026-11-06 06:27 UTC

### Zakres scalanej poprawki Barony

- Wiersz mapy zachowuje własne X/Y; identyfikator pokonującego jest akceptowany tylko jako dodatnia bezpieczna liczba całkowita.
- Cel przed obserwacją musi mieć niepusty identyfikator katalogowy, poprawny KID/krainę i całkowite X/Y w granicach mapy.
- Każdy dodatkowy wiersz na tych samych współrzędnych oznacza wynik `ambiguous_duplicate_rows`, nawet jeśli tylko jeden wiersz pasuje do typu 11 i oczekiwanego właściciela NPC.
- Porównanie dwóch próbek wymaga dokładnie jednego, wewnętrznie spójnego wiersza typu 11 na tym samym ID katalogowym, krainie, KID, X/Y i właścicielu NPC. Kopie pól cooldownu i defeatera muszą zgadzać się z wierszem źródłowym.
- Kandydat zmiany stanu jest odrzucany, gdy próbki są niechronologiczne albo dzieli je ponad 2 godziny. `attack_time_utc` pozostaje `null`; przedział obserwacji nie jest dokładnym czasem ataku.

### Integracja z aktualnym main

- Gałąź bazowa zawiera już świeży, kompletny snapshot mapy IT1 z 2026-11-06 06:11:51.997482Z (2021 rekordy, 2021 unikalnych współrzędnych; tylko pola mapowe).
- Zachowano sekcje 39–40 z main, opisujące ostatnią diagnostykę mostu i PL1. Dołączono wyłącznie zmianę logiki, testy regresyjne, README i ten wpis; nie nadpisano nowszego dziennika main.
- PR nie dodaje historii ataków ani nie wykorzystuje cooldownów Beta/IT1 jako danych PL1. Nie było autoryzowanej sesji produkcyjnego PL1 ani potwierdzonego rekordu ataku.

### Walidacja po integracji — wyniki potwierdzone 2026-11-06 06:31 UTC

- PR #10 został scalony 2026-11-06 06:30:00Z. Commit main: `1ec04b9d8be333587107837a30ba8608956870bd`.
- Workflow na gałęzi przed scaleniem: run `42174716344`, SUCCESS; 13/13 testów Python, 47/47 testów Node, walidacja kontraktu E4K, mobilnego UI i katalogu PASS.
- Ponowny workflow po scaleniu na main: run `42174810272`, SUCCESS; ponownie 13/13 Python, 47/47 Node, walidacja kontraktu E4K, mobilnego UI i katalogu PASS. Plan: 2021 cele, 199 sektorów, 1 990 000 potencjalnych pól.
- Publiczny GGE Tracker w tym przebiegu: `E4K_PL1` w katalogu ma `enabled=true`, `fortress=false`; `/dungeons` dla `E4K_PL1` zwraca HTTP 400 `Invalid server`. Alias `EmpirefourkingdomsExGG_3` również HTTP 400.
- Beta: `E4K_PL1_BETA` HTTP 200, 976 punktów (Piaski 312, Lód 409, Ogień 255); 5 sprawdzonych historii dało 4659 rekordów. Są to wyłącznie dane Beta. IT1 zwrócił 2021 rekordów mapy. Zgodność współrzędnych Beta↔IT1 wyniosła 976/976; nie stanowi to dowodu historii produkcyjnego PL1.
- Historia graczy produkcyjnego PL1 z migawki Szpiegowania: 3/3 `Player not found`, 0 rekordów; próba suffixu zoneId=259: 3/3 `Invalid player ID`; katalog nie udostępnia trzycyfrowego kodu serwera.
- Publiczny most `/status`: HTTP 200, ale `EmpirefourkingdomsExGG_3` ma `target_connected=false`; GAM/GAA pominięto. Nie uzyskano odpowiedzi mapy, ruchów ani raportów z produkcyjnego PL1.
- Porównanie `last_attack` z globalnym cooldownem wykonano wyłącznie diagnostycznie na Beta i IT1. Nie przeniesiono żadnych cooldownów ani historii do PL1.
- Pages run `42174809096`: build SUCCESS, report-build-status SUCCESS, deploy SUCCESS. Log deploy potwierdza `pages_build_version=1ec04b9d8be333587107837a30ba8608956870bd` i URL `https://marwlo-ops.github.io/Empirenew/`.
- Zmiany scalonego PR obejmują wyłącznie `research/fortece-barona-status.md`, `scripts/barony-live/README.md`, `scripts/barony-live/probe-core.mjs` i `scripts/barony-live/probe-core.test.mjs`. Nie zmieniono Mapa, Szpiegowania, Dodatkowe, `barony.html` ani katalogu współrzędnych.
- Ataki potwierdzone na produkcyjnym PL1 w tym przebiegu: 0. `attack_time_utc` pozostaje `null`; sygnały GAA pozostają kandydatami do czasu walidacji na autoryzowanej sesji PL1 i niezależnym raporcie NPC.


## 42. Audyt endpointu ruchów zamków i pochodzenia timestampów — 2026-11-06 07:54 UTC

### Nowe rozróżnienie endpointów GGE Tracker

Sprawdzono publiczny kod gge-tracker/gge-tracker (snapshot źródłowy 7d620820a76cde4176c752f6972ce6f0c9ad7ab1):

- GET /server/movements jest opisany w api-server.ts jako paginowana historia ruchów zamków graczy. Komentarz endpointu definiuje movementType: 1=add, 2=remove, 3=move. Frontend opisuje tę stronę jako relokacje, nowe posterunki i podboje.
- To nie jest lista marszów armii z GAM i nie zawiera semantyki ataków na NPC. Endpoint został wykluczony jako źródło Barony; nie wykonano niepotrzebnego odpytywania.
- GET /dungeons/player/{playerId} odczytuje dungeons_history.attacked_at, kid, position_x, position_y.
- Lista GET /dungeons mapuje last_attack z dungeons.last_attack_at, a nie bezpośrednio z kolumny dungeons_history.attacked_at.

### Korekta interpretacji last_attack

Wcześniejszy eksperyment global_available_at - last_attack dał wartości bliskie 86 400 sekund na próbkach Beta/IT1. Po prześledzeniu kodu źródłowego nie można z tego wyprowadzić dokładnej semantyki timestampu:

- collectDungeonCooldowns() przetwarza obiekt typu 11, czyta dungeon[5] jako pozostały cooldown i dungeon[6] jako ID pokonującego; global_available_at wylicza jako currentTime + remainingCooldown24h.
- persistDungeonUpdates() wstawia do dungeons_history tylko kid, position_x, position_y, player_id; nie przekazuje jawnie attacked_at.
- W widocznym kodzie scraper nie zapisuje również jawnie dungeons.last_attack_at. Nie znaleziono w publicznym źródle schematu bazy, defaultu kolumny ani triggera, który wyjaśniałby, jak te timestampy są uzupełniane.
- filterByAttackCooldown=3 oznacza dungeons, których efektywny cooldown kończy się w ciągu 60 minut. Mimo tego sam wynik różnicy 24 h nie identyfikuje źródła last_attack.
- Wniosek z wcześniejszego testu zostaje obniżony z „silnie wspiera estymację cooldownową” do „nierozstrzygnięte pochodzenie pola; nie używać jako czasu ataku”. Żaden timestamp z Beta/IT1 nie jest przenoszony do PL1.

### Niezależna walidacja semantyki GAM w ggejs

Kod ggejs z rewizji a4980b01404ab01c9b826a267f331ae8c953d237 potwierdza:

- MovementType.NPCAttack = 11;
- WorldMapArea.BossDungeon = 11;
- BasicMovement mapuje D=0 jako ruch wychodzący, z graczem w sourceArea, a D=1 jako ruch powrotny, z graczem w targetArea;
- departureTime = now - PT, arrivalTime = now + (TT - PT), więc czasy zależą od lokalnego zegara parsowania i są estymatami;
- BossDungeonMapobject: data[5] = pozostały cooldown, data[6] = defeaterPlayerId, data[7] = KID.

To niezależnie wspiera obecne filtry w ekstraktorze GAM: typ ruchu 11, kierunek 0, cel typu 11, KID i oczekiwany właściciel NPC oraz dodatni ID gracza. Testy jednostkowe już sprawdzają odrzucenie kierunku 1 i niezgodnego typu/krainy/właściciela; nie zmieniano parsera.

### Stan PL1 i następny test

- Ten audyt dotyczył publicznego kodu i semantyki endpointów; nie jest nowym odczytem live PL1.
- Nadal nie ma odpowiedzi GAM z autoryzowanej sesji produkcyjnego PL1 ani raportu NPC z MID/LID.
- Nie dodano rekordów ataków. attack_time_utc pozostaje null.
- Następny wartościowy test to lokalny, read-only odczyt GAM na autoryzowanej sesji PL1, z korelacją MID, KID, TA i ID gracza, a następnie niezależny raport NPC BLS/BLM. Publiczny /server/movements nie będzie ponawiany.

Zakres zmian dokumentacyjnych: wyłącznie README modułu Barony i ten dziennik badawczy. Bez zmian w Mapa, Szpiegowanie, Dodatkowe, barony.html, mapa-rb.html i danych współrzędnych.


## 43. Audyt semantyki BLS.PS/BLM.PS — 2026-11-06 08:48 UTC

### Wynik inspekcji przypiętego ggejs

Sprawdzono bezpośrednio kod źródłowy ggejs z rewizji `a4980b01404ab01c9b826a267f331ae8c953d237`:

- `src/commands/bls.js`: `parseBLS()` odczytuje `LID`, `MID`, mapobject, uczestników i wynik, ale nie odczytuje ani nie interpretuje `params.PS`.
- `src/commands/blm.js`: `parseBLM()` odczytuje `LID`, `MID` i dane dowódców; `params.PS` nie jest interpretowane.
- `src/commands/bld.js`: parser szczegółów zwraca fale, jednostki i narzędzia; nie dostarcza pola czasu bitwy.
- `src/structures/messages/BasicBattleLogMessage.js`: pobranie raportu wykonuje kolejno BLS, BLM i BLD, ale nie przelicza PS na czas.
- `src/structures/messages/BasicMessage.js`: `deliveryTime = new Date(Date.now() - data[5] * 1000)`; jest to lokalna estymacja wieku wiadomości, nie absolutny serwerowy timestamp.

Źródła:
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/commands/bls.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/commands/blm.js
- https://github.com/476f6f6467616d6553747564696f73/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/commands/bld.js
- https://github.com/476f6f6467616d6553747564696d655374756469/ggejs/blob/a4980b01404ab01c9b826a267f331ae8c953d237/src/structures/messages/BasicMessage.js

### Korekta klasyfikacji czasu

Wcześniejszy własny parser Barony zakładał, że `BLS.PS` i `BLM.PS` oznaczają sekundy od bitwy. Nie znaleziono takiej definicji w przypiętym kodzie klienta ani w innym zweryfikowanym źródle. Sama nazwa pola i testy syntetyczne nie są dowodem semantyki.

Wprowadzana korekta:
- wartości numeryczne PS mogą być zachowane wyłącznie jako `ps_value_unverified`;
- nie obliczamy `battle_time_estimate_utc` z PS;
- nie wykonujemy cross-checku BLS/BLM jako walidacji czasu, dopóki znaczenie pola nie zostanie niezależnie potwierdzone;
- pełny raport NPC nadal może potwierdzić KID/X/Y, ID atakującego, obrońcę NPC i wynik bitwy w zakresie skrzynki zalogowanego konta;
- `report_delivery_time_estimate_utc` pozostaje tylko estymacją wieku wiadomości;
- `battle_time_estimate_utc` oraz `attack_time_utc` pozostają `null`.

### GGE WebSocket Studio — wykluczone jako źródło E4K PL1

Karta rozszerzenia GGE WebSocket Studio opisuje lokalne przechwytywanie ramek WebSocket, ale deklaruje aktywność wyłącznie na domenach `empire.goodgamestudios.com` i `empire-html5.goodgamestudios.com`. Przypięty ggejs wybiera natomiast transport TCP dla stref `EmpirefourkingdomsExGG*`. W konsekwencji rozszerzenie nie jest potwierdzoną ani właściwą drogą pasywnego przechwytywania ruchu E4K PL1; może dotyczyć przeglądarkowego Empire, nie mobilnego E4K. Nie używamy go jako źródła danych ani dowodu semantyki PS.

Źródło zakresu rozszerzenia: https://chromewebstore.google.com/detail/gge-websocket-studio/deaaangkjfdcpegbebpdhkiknaniomeg

### Stan danych produkcyjnych

- W tym audycie nie logowano się do PL1 i nie pobierano danych gry.
- Nie uzyskano nowego ruchu GAM ani raportu z produkcyjnego PL1.
- Nie zapisano żadnego ataku PL1.
- Nie wykorzystano cooldownu IT1/Beta.
- Następny krok: uzyskać autoryzowany raport NPC z PL1 na koncie testowym, porównać BLS/BLM PS z niezależnym czasem referencyjnym z widocznego raportu/zdarzenia i dopiero wtedy ewentualnie przywrócić estymację z udokumentowaną niepewnością.

Zakres planowanej zmiany: wyłącznie `scripts/barony-live/probe-core.mjs`, testy rdzenia Barony, README Barony, workflow Barony i ten dziennik. Bez zmian w Mapa, Szpiegowanie, Dodatkowe, `barony.html`, `mapa-rb.html` ani katalogu współrzędnych.


## 44. Wdrożenie korekty BLS/BLM PS i weryfikacja main — 2026-11-06 08:57 UTC

### Zmiana i commit

- PR #14 został scalony metodą squash: https://github.com/marwlo-ops/Empirenew/pull/14
- Commit main: `02beca2274eb69958d2961558badd56a29dab0ce`.
- Zmienione pliki: `.github/workflows/baron-pl1-probe.yml`, `research/fortece-barona-status.md`, `scripts/barony-live/README.md`, `scripts/barony-live/probe-core.mjs`, `scripts/barony-live/probe-core.test.mjs`, `scripts/barony-live/probe.mjs`.
- Żadna zakładka Mapa, Szpiegowanie ani Dodatkowe, plik UI `barony.html` ani katalog współrzędnych nie został zmieniony.

### Testy po scaleniu

Workflow `Probe PL1 fortress API`, run 42191241835:
- Python: 13/13 PASS.
- Node: 47/47 PASS.
- node --check dla probe/probe-core/reports/prepare-e4k-data: PASS.
- weryfikacja przypiętego klienta i metadanych produkcyjnego PL1: PASS.
- test mobilnego UI Barony: PASS.
- katalog IT1 map-only: 2021 unikalne współrzędne, bez cooldown/player/attack fields: PASS.

W trakcie iteracji dwa wcześniejsze przebiegi CI ujawniły regresje w zastępowanym fragmencie: brak eksportów selektora raportów oraz zbyt rygorystyczne wymaganie MID/LID do samego potwierdzenia raportu. Oba problemy poprawiono; finalny run na gałęzi i run po scaleniu zakończyły się sukcesem. Raport może potwierdzić cel i atakującego także wtedy, gdy identyfikatory MID/LID nie są dostępne, ale wtedy nie koreluje PS.

### Najnowszy odczyt diagnostyczny PL1

- TCP handshake do `e4k-live-pl1-game.goodgamestudios.com:443`: PASS, 204 ms, bez loginu i payloadu.
- GGE Tracker `E4K_PL1 /dungeons`: HTTP 400; publiczny katalog nadal nie obsługuje produkcyjnego PL1.
- `/status` publicznego mostu: HTTP 200, ale `target_connected=false`; komendy GAA/GAM pominięte.
- Odczyty Beta/IT1 pozostały odseparowane diagnostycznie; żaden cooldown ani timestamp z tych serwerów nie został użyty dla PL1.
- Nowych raportów NPC ani ruchów GAM z produkcyjnego PL1 nie pobrano; potwierdzone ataki PL1 w tym przebiegu: 0.

### Publikacja

GitHub Pages run 42191241751:
- build: SUCCESS;
- deploy: SUCCESS;
- report-build-status: SUCCESS;
- `pages_build_version=02beca2274eb69958d2961558badd56a29dab0ce`;
- URL: https://marwlo-ops.github.io/Empirenew/.

### Stan blokady

PR #13 (bezpieczny pakiet własnego mostu) nadal pozostaje draft i nie jest wdrożoną usługą. Nie utworzono forka/hostingu, nie ustawiono sekretów i nie ma autoryzowanej sesji PL1. Następny test wymagający konta to lokalny read-only odczyt GAA/GAM oraz skrzynki raportów na koncie testowym PL1; dane logowania muszą pozostać lokalne.


## 45. Korekta zakresu GGE WebSocket Studio — 2026-11-06 08:59 UTC

Wcześniejsza wzmianka o GGE WebSocket Studio jako możliwej drodze walidacji BLS/BLM dla konta E4K została zawężona. Listing rozszerzenia ogranicza aktywność do dwóch domen przeglądarkowego Empire i opisuje przechwytywanie WebSocket. Przypięty klient ggejs dla stref `EmpirefourkingdomsExGG*` używa TCP. Nie ma dowodu, że rozszerzenie widzi transport E4K PL1, więc tę ścieżkę wykluczamy z planu testów PL1. Nie wpływa to na kod ani klasyfikację zdarzeń.


## 46. Naprawa jawnego pobierania skrzynki NPC i świeży probe PL1 — 2026-11-06 10:34 UTC

### Wykryty błąd ścieżki raportów

Audyt przypiętego `ggejs` 2.2.0 z rewizji `a4980b01404ab01c9b826a267f331ae8c953d237` wykazał konkretny błąd w głównym `probe.mjs --reports`: 

- `E4KClient.connect()` wykonuje połączenie, weryfikację logowania, login i ping/pong; nie wywołuje `SNE`.
- `BaseClient.mailMessages` zaczyna jako pusta tablica. Jest zapełniana przez parser odpowiedzi `SNE` w `commands/sne.js`.
- `commands/sne.js` udostępnia `showMessages(client)`, które jawnie wysyła `SNE` i zwraca sparsowaną skrzynkę.
- Poprzednia ścieżka `probe.mjs --reports` jedynie czekała, a następnie czytała `client.mailMessages` bez żądania SNE. Mogła więc pomylić brak pobrania skrzynki z pustą skrzynką.

### Poprawka

- Commit kodu: `119189f428343fb7b8f4c3faf3f23e22553a5430`.
- Commit korekty testu integracyjnego: `76ecfef5c1b17ae4c9ebd7f19cec3197049f26d3`.
- `probe.mjs --reports` teraz jawnie wywołuje `showMessages(client)` przez `requestMailboxMessages()`.
- Dodano ograniczony czas oczekiwania oraz osobne stany: odpowiedź odebrana, brak pola odpowiedzi, błąd żądania i timeout. W błędzie raportowany jest wyłącznie typ wyjątku, nie jego surowa treść.
- Dodano testy odpowiedzi SNE, pustej/brakującej odpowiedzi, błędu, timeoutu oraz sprawdzenie połączenia helpera z głównym probe.
- README poprawia wcześniejsze nieścisłe stwierdzenie, że samo `connect()` pobiera skrzynkę.

Pierwszy CI po poprawce kodu (`42203599307`) miał 52/53 testy: jedyną porażką było zbyt mocno escapowane wyrażenie regularne w nowym teście statycznym. Poprawiono samą asercję na sprawdzenie literalnych fragmentów źródła; logika produkcyjna nie wymagała zmiany. Końcowy workflow `Probe PL1 fortress API`, run `42203696114`, zakończył się SUCCESS:
- Python: 13/13 PASS;
- Node: 53/53 PASS;
- składnia skryptów, kontrola przypiętego klienta i metadanych PL1: PASS;
- test mobilnego Barony: PASS;
- katalog mapowy IT1: 2021 unikalnych współrzędnych, bez pól ataku/cooldownu/gracza/gotowości: PASS.

Poprawka nie była testowana na zalogowanym koncie PL1 w CI. Wymaga to lokalnego uruchomienia operatora; nie użyto żadnych poświadczeń w GitHub Actions.

### Świeży odczyt publicznych endpointów — run 42203696114

- TCP do `e4k-live-pl1-game.goodgamestudios.com:443`: handshake PASS, 187 ms, `payload_sent=false`. To wyłącznie dostępność TCP, nie sesja gry.
- GGE Tracker `/servers`: 63 wpisy, obecne aliasy `E4K_PL1` i `E4K_PL1_BETA`.
- Katalog serwerów: `E4K_PL1 enabled=true, fortress=false`; `E4K_PL1_BETA enabled=true, fortress=true`.
- `/dungeons` dla `E4K_PL1` zwrócił HTTP 400 (produkcyjny PL1 nie jest obsługiwany przez listę serwerów endpointu); `/dungeons/meta` dla `E4K_PL1` również HTTP 400.
- Alias strefy `EmpirefourkingdomsExGG_3` i starszy wariant `EmpirefourkingdomsExGG2_3` również otrzymały HTTP 400 jako nieprawidłowe wartości nagłówka `gge-server`.
- `E4K_PL1_BETA` zwrócił HTTP 200 i 976 rekordów, a IT1 HTTP 200 i 2021 stron przy próbce size=1. To wyłącznie osobne środowiska; ich cooldownów, historii ani timestampów nie przeniesiono do PL1.
- Próba historii produkcyjnego PL1 dla trzech identyfikatorów z migawki Szpiegowania: lookup HTTP 200, ale każdy zwrócił `Player not found`; historia HTTP 400 `Invalid player ID`, 0 rekordów.
- Dopisanie `zoneId=259` do surowych ID nie rozwiązało trasy: 0 odpowiedzi HTTP 200, wszystkie próbki HTTP 400 `Invalid player ID`. Kod serwera w katalogu GGE Tracker pozostaje null, więc wariant sufiksu katalogowego został pominięty.
- Publiczny most: `/status` HTTP 200, `target_connected=false`; GAA/GAM pominięte, ponieważ połączenie z docelowym socketem PL1 nie zostało potwierdzone.

### Wniosek i zakres danych

W tej iteracji nie wykonano logowania do gry, nie pobrano ruchów GAM ani raportów NPC z konta, nie znaleziono potwierdzonego ataku PL1 i nie zapisano żadnego zdarzenia. Nadal brakuje działającego, autoryzowanego odczytu produkcyjnej sesji PL1 lub obsługi produkcyjnego PL1 po stronie GGE Tracker. Sam handshake TCP, wpis katalogowy `fortress=false` i nieudane próby historii gracza nie są dowodem ataku.

Nie wykorzystano IT1/Beta cooldownu ani historii jako danych PL1. Nie zmieniono zakładek Mapa, Szpiegowanie ani Dodatkowe, plików `barony.html` / `mapa-rb.html` ani katalogu współrzędnych.

### Publikacja

GitHub Pages run `42203695548` dla commitu `76ecfef5c1b17ae4c9ebd7f19cec3197049f26d3`: build, report-build-status i deploy zakończone SUCCESS.

## 47. Korekta identyfikatorów GGE Tracker, niezależna walidacja GAM i status Pages — 2026-11-06

### GGE Tracker: wymagany sufiks ID gracza

Ponowny audyt publicznego kodu GGE Tracker ujawnił, dlaczego wcześniejsze próby historii gracza nie dawały wiarygodnego wyniku:

- `ApiHelper.verifyIdWithCountryCode()` przyjmuje wyłącznie dodatni numeryczny identyfikator dłuższy niż 3 znaki.
- `getCountryCode()` pobiera ostatnie trzy znaki ID, a `removeCountryCode()` usuwa ten trzycyfrowy sufiks przed zapytaniem do bazy.
- Trasa `GET /dungeons/player/{playerId}` wybiera pulę PostgreSQL na podstawie tego sufiksu, a następnie szuka historii po bazowym ID gracza.
- Inne trasy serwerowe GGE Tracker dopisują `request['code']` do zwracanych `player_id` i `alliance_id`.

Źródła:
- https://github.com/gge-tracker/gge-tracker/blob/main/gge-tracker-backend-api/src/api/helper/api-helper.ts
- https://github.com/gge-tracker/gge-tracker/blob/main/gge-tracker-backend-api/src/api/routes/api-dungeons.ts
- https://github.com/gge-tracker/gge-tracker/blob/main/gge-tracker-backend-api/src/api/routes/api-server.ts

Wniosek: `e4k-data zoneId=259` nie jest potwierdzonym trzycyfrowym kodem serwera GGE Tracker. Poprzednie dopisanie `259` było tylko hipotezą i zwróciło HTTP 400. Surowe `member_id` z migawki Szpiegowania również nie jest wystarczającym ID do tej trasy. Katalog `/servers/catalog` nadal zwraca dla `E4K_PL1` `code=null`, więc nie ma zweryfikowanego sufiksu, którego można użyć.

### Zmiana diagnostyki

- Commit gałęzi: `8e3eb16b9cd64af086562eb3489dbed6b6cf9ffe`.
- W `scripts/probe-baron-pl1.js` usunięto dwa nieproduktywne warianty: wysyłanie surowych ID z migawki oraz dopisywanie `zoneId=259`.
- Pozostawiono wyłącznie wariant oparty o dokładny trzycyfrowy `<code>` z katalogu GGE Tracker.
- Jeżeli katalog nie podaje kodu, test kończy się jawnym `skipped`; nie zgaduje sufiksu i nie odpytuje historii pod błędnym ID.
- Nie zmieniono logiki ekstrakcji zdarzeń ani danych mapy.

### Niezależna walidacja sposobu pobierania GAM

Kod niezależnego klienta `pygge` potwierdza, że `GAM` może zwrócić wiele odpowiedzi:
- `Movements.get_movements()` wysyła `gam` z pustym obiektem;
- oczekuje wielu odpowiedzi (`count=-1`);
- scala tablice `M` i `O`;
- deduplikuje ruchy po `MID`;
- implementacja bazowa kończy zbieranie po 100 ms ciszy.

Źródła:
- https://github.com/danadum/pygge/blob/main/pygge/map/movements.py
- https://github.com/danadum/pygge/blob/main/pygge/base_gge_socket.py

Barony stosuje analogiczny model, ale dłuższe okno 250 ms ciszy, deduplikację po MID oraz kontrolę statusu odpowiedzi XT. To niezależne potwierdzenie sposobu zbierania batchy, nie dowód globalnej widoczności ruchów. GAM nadal obejmuje wyłącznie ruchy udostępnione autoryzowanej sesji danego konta.

### Ponowna weryfikacja CI i produkcyjnego PL1

Workflow `Probe PL1 fortress API`, run `42208565123`, zakończył się SUCCESS:
- Python: 13/13 PASS;
- Node: 54/54 PASS;
- plan mapy: 2021 celów, 199 sektorów, 1 990 000 szacowanych pól;
- weryfikacja przypiętego klienta E4K i metadanych PL1: PASS;
- test mobilnego UI Barony: PASS;
- katalog mapowy IT1: 2021 unikalnych współrzędnych, bez pól ataku/cooldownu/gracza/gotowości: PASS.

Odczyt publiczny z tego runu:
- TCP do produkcyjnego PL1: handshake PASS, 176 ms, `payload_sent=false`; bez logowania i komend gry;
- `E4K_PL1 /dungeons`: HTTP 400 — serwer nie jest obsługiwany przez ten endpoint;
- katalog `E4K_PL1`: `enabled=true`, `fortress=false`, `code=null`;
- publiczny most: `target_connected=false`, dlatego GAA/GAM pominięte;
- brak potwierdzonego ruchu GAM i raportu NPC z produkcyjnego PL1;
- potwierdzone ataki PL1 w tym runie: 0.

Nie użyto cooldownów ani historii IT1/Beta jako danych PL1.

### Korekta statusu GitHub Pages

Sprawdziłem logi jobów, a nie tylko status całego workflow. Dla runu Pages `42208564666`:
- `build`: SUCCESS;
- `report-build-status`: SUCCESS;
- `deploy`: FAILURE — po utworzeniu deploymentu dla `efd6426a157fc954d0a9f1c117c9543713285d38` usługa pozostawała w stanie `syncing_files` przez 10 minut; akcja osiągnęła timeout i anulowała deployment.

To nie był zakończony sukcesem deploy. Najnowszy późniejszy commit main `9cd0b1940f3720134d44de2fe4f31af6aabd8763` dotyczył wyłącznie snapshotów/historycznych plików trackerów; w dostępnych metadanych nie znalazłem potwierdzenia udanego Pages deploymentu dla tego SHA. Nie deklaruję więc, że najnowsza wersja strony została opublikowana.

Źródła:
- https://github.com/marwlo-ops/Empirenew/actions/runs/42208565123
- https://github.com/marwlo-ops/Empirenew/actions/runs/42208564666

### Wniosek i następny krok

Nowy audyt zawęził problem historii GGE Tracker: brakuje prawidłowego trzycyfrowego kodu serwera PL1, a nie kolejnej hipotezy opartej na `zoneId`. Następny krok to uzyskać kod z wiarygodnego źródła GGE Tracker albo rzeczywisty tracker-issued player ID dla E4K_PL1. Równolegle potrzebny jest lokalny, autoryzowany odczyt PL1 przez `--movements --reports`; CI nie loguje się na konto i nie otrzymuje globalnego feedu.

Nie zapisano żadnego nowego ataku PL1. Nie zmieniono zakładek Mapa, Szpiegowanie ani Dodatkowe, plików UI ani katalogu współrzędnych.

### Walidacja bieżącej gałęzi PR #16

- PR #16: https://github.com/marwlo-ops/Empirenew/pull/16, baza `9cd0b1940f3720134d44de2fe4f31af6aabd8763`, dwa zmienione pliki.
- Parserowy test składni zmodyfikowanego `scripts/probe-baron-pl1.js` w środowisku narzędziowym: PASS; dodatkowo potwierdzono usunięcie obu niezweryfikowanych wariantów ID i zachowanie wyłącznie ścieżki katalogowego kodu 3-cyfrowego. Nie jest to pełny test runtime Node.
- Dostępny endpoint statusu commita nie zwrócił checków, a wrapper listowania workflow zwraca tylko runy uruchomione przez pull request; ten workflow jest uruchamiany przez push. Nie mam zatem potwierdzonego wyniku pełnego CI dla bieżącej gałęzi i nie scalono PR #16.
- Run `42208565123` opisany wyżej jest ostatnim potwierdzonym pełnym testem poprzedniego commita `efd6426a157fc954d0a9f1c117c9543713285d38`, a nie nowej gałęzi.
- Nie wykonano nowego deployu Pages dla PR #16; publikacja pozostaje zablokowana do czasu potwierdzenia poprawnego deployu z main.


## 48. Audyt pochodzenia `attacked_at` / `last_attack` — 2026-11-06 12:05 UTC

### Weryfikacja publicznego kodu GGE Tracker

Przeanalizowano przypięty snapshot źródłowy GGE Tracker `7d620820a76cde4176c752f6972ce6f0c9ad7ab1`, a nie tylko nazwy pól w odpowiedzi API.

- `appendDungeons()` przyjmuje obiekty typu 11, zapisuje `dungeon[5]` jako pozostały cooldown, `dungeon[6]` jako ID gracza i ustawia `updatedAt: new Date()` lokalnie.
- `collectDungeonCooldowns()` ponownie czyta GAA; wylicza `global_available_at = currentTime + remainingCooldown24h` i zapisuje `player_id = dungeon[6]`. Nie przekazuje do bazy serwerowego czasu rozpoczęcia ataku.
- `persistDungeonUpdates()` wykonuje INSERT do `dungeons_history` wyłącznie z polami `kid`, `position_x`, `position_y`, `player_id`. Kolumna `attacked_at` nie występuje w INSERT.
- Endpoint `getDungeonsByPlayer()` odczytuje `DH.attacked_at` z bazy i zwraca to pole klientowi. Publiczny kod nie pokazuje jednak schematu produkcyjnej tabeli, defaultu ani triggera, który wyjaśniałby źródło tej wartości.
- Wniosek: API wystawia `attacked_at`, ale z publicznego kodu nie można potwierdzić, że jest to dokładny czas ataku. Nie wolno publikować go jako takiego bez potwierdzenia schematu bazy lub kontrolowanego testu z niezależnym czasem referencyjnym.
- Wcześniejsza obserwacja, że `global_available_at - last_attack` w IT1/Beta jest bliskie 24 godzinom, nie rozstrzyga pochodzenia timestampu. Oba źródła pozostają poza produkcyjnym PL1, a `last_attack` również nie jest uznawany za dokładny czas PL1.

### Identyfikator gracza

- Endpoint historii gracza wymaga numerycznego ID z trzycyfrowym sufiksem kodu serwera.
- `getCountryCode()` pobiera ostatnie trzy cyfry, a `removeCountryCode()` usuwa je przed zapytaniem do bazy.
- Katalog GGE Tracker dla `E4K_PL1` nadal zwraca `code=null`. `e4k-data zoneId=259` nie jest równoważnym, potwierdzonym kodem.
- PR #16 został scalony do main jako commit `8fc9e3e2df40e23fd33bb370664b9a26e73cdef4`. Usunięto niepotwierdzone próby z surowym `member_id` i sufiksem 259; odczyt historii jest pomijany, gdy nie ma prawdziwego kodu serwera.

### Najnowsza walidacja po scaleniu PR #16

Workflow `Probe PL1 fortress API`, run `42214676661`, zakończony SUCCESS:
- Python: 13/13 PASS.
- Node: 54/54 PASS.
- przypięty klient E4K i metadane PL1: PASS;
- katalog IT1: 2021 unikalne współrzędne, bez pól ataku, cooldownu, gracza i gotowości: PASS;
- test mobilnego UI Barony: PASS (statyczny CI; nie jest to test fizycznego telefonu);
- TCP PL1: handshake 199 ms, `payload_sent=false` — bez logowania i komend gry;
- GGE Tracker `E4K_PL1 /dungeons`: HTTP 400;
- katalog `E4K_PL1`: `enabled=true`, `fortress=false`, `code=null`;
- Beta: 976 rekordów i 8477 rekordów historii w pięciu próbkach — wyłącznie diagnostyka Beta;
- IT1: live próbka API HTTP 200; pełny publiczny katalog pozostaje snapshotem 2021 rekordów z importu 10:01:36 UTC;
- most: `target_connected=false`; GAA/GAM pominięte.

GitHub Pages run `42214675962` dla commitu `8fc9e3e2df40e23fd33bb370664b9a26e73cdef4`: build SUCCESS, report-build-status SUCCESS, deploy SUCCESS. Log deploy zawiera `Reported success!` i URL strony.

### Wniosek i następny krok

- Nie uzyskano nowej autoryzowanej sesji produkcyjnego PL1.
- Nie uzyskano ruchów GAM ani raportów NPC z produkcyjnego PL1.
- Liczba nowych potwierdzonych ataków PL1: 0.
- `attack_time_utc` pozostaje null; `attacked_at` i `last_attack` z GGE Tracker nie są traktowane jako potwierdzony czas ataku.
- Następny test: na koncie demo produkcyjnego PL1 wykonać kontrolowany atak, zebrać GAA przed/po, GAM oraz raport NPC z MID/LID i porównać z niezależnym czasem referencyjnym. Dane logowania pozostają lokalne; nie umieszczać ich w repozytorium ani CI.

Zakres tej korekty: wyłącznie dokumentacja audytu. Nie zmieniono Mapa, Szpiegowania, Dodatkowe, `barony.html`, `mapa-rb.html` ani katalogu współrzędnych.


## 49. Pełny ponowny import IT1 i publikacja snapshotu — 2026-11-06 12:11 UTC

### Rzeczywisty import

Ponowiono zakończony wcześniej workflow importera (run `42199429344`, attempt 2). Job pobrał ponownie pełną odpowiedź GGE Tracker IT1:

- Czas snapshotu: `2026-11-06T12:09:26.402083+00:00`.
- Wynik: 2021 rekordów map-only, 1/1 strona API.
- Piaski: 671; Lód: 779; Ogień: 571.
- 2021 unikalnych ID i współrzędnych; 0 duplikatów.
- Każdy rekord ma dokładnie: `id`, `kid`, `kingdom`, `x`, `y`, `type`, `source_server`.
- Brak pól cooldownu, gotowości, gracza, atakującego i historii.
- Plan skanowania: 199 sektorów 100×100, 1 990 000 potencjalnych pól.

Porównanie pełnych współrzędnych z snapshotem 10:01:36 UTC: 0 dodanych i 0 usuniętych lokalizacji; katalog pozostaje stabilny. Zmienił się czas pobrania, nie zestaw współrzędnych.

### Testy i publikacja

- Importer: `python -m py_compile` PASS.
- Testy importera: 28/28 PASS.
- Kontrola jednego właściciela harmonogramu importu: PASS.
- Walidator katalogu: PASS.
- Walidacja planu Barony: PASS.
- Commit snapshotu: `2d63d3a433c0991b2f536a3cddad313d222b5d7f`.
- Pages run `42215520379`: build SUCCESS, report-build-status SUCCESS, deploy SUCCESS; log potwierdza `Reported success!` i URL `https://marwlo-ops.github.io/Empirenew/`.

Sekcja 48 została skorygowana: najnowszy pełny katalog nie jest już snapshotem 10:01, lecz snapshotem 12:09 UTC. Import nadal pochodzi z IT1; pole `target_server=E4K_PL1` opisuje docelową siatkę współrzędnych potwierdzoną przez operatora, a nie niezależny live odczyt wszystkich 2021 obiektów z PL1.

### Wpływ na historię PL1

Import nie pobiera ani nie zapisuje historii ataków. Nie zmienia statusu produkcyjnego PL1: GGE Tracker `E4K_PL1 /dungeons` nadal zwraca HTTP 400, a ostatni probe nie miał połączonej sesji mostu. Liczba nowych potwierdzonych ataków PL1 pozostaje 0; `attack_time_utc` pozostaje null.


## 50. Potwierdzenie pochodzenia czasu GGE Tracker i świeży probe PL1 — 2026-11-06 12:45 UTC

### Nowy, istotny wynik audytu kodu GGE Tracker

Przejrzałem pełną ścieżkę aktualizacji cooldownów w przypiętym publicznym snapshotcie GGE Tracker `7d620820a76cde4176c752f6972ce6f0c9ad7ab1` — od odczytu GAA, przez `collectDungeonCooldowns()`, po zapis do PostgreSQL i endpointy API.

1. `refreshDungeonSquare()` ustawia `currentTime = new Date()` po otrzymaniu odpowiedzi HTTP z mostu.
2. `collectDungeonCooldowns()` czyta `dungeon[5]` jako pozostały cooldown 24h i `dungeon[6]` jako ID gracza.
3. `global_available_at` jest wyliczane lokalnie jako `currentTime + remainingCooldown24h`.
4. `persistDungeonUpdates()` zapisuje do `dungeons_history` wyłącznie kolumny `kid, position_x, position_y, player_id`. Nie przekazuje pola `attacked_at` ani serwerowego czasu zdarzenia.
5. Endpoint `GET /dungeons/player/{playerId}` odczytuje `DH.attacked_at` z bazy. Endpoint listy `GET /dungeons` zwraca natomiast `D.last_attack_at` jako `last_attack` oraz `D.last_attacker_id` jako `player_id`.

Wniosek: pola `attacked_at` i `last_attack` są wartościami pochodzącymi z warstwy bazy/scrapera, a nie polami czasu odczytanymi bezpośrednio z pakietu ataku. Publiczny kod nie ujawnia DDL, defaultu ani triggerów, które ustalałyby dokładną semantykę tych kolumn. Nie można więc potwierdzić, że którykolwiek z tych timestampów jest czasem rozpoczęcia ataku. `global_available_at - 24h` może służyć co najwyżej do estymacji z ograniczoną dokładnością, nigdy do potwierdzonego `attack_time_utc`.

Dodatkowe rozróżnienie testów: backendowe `dungeon-scenario.ts` wstawia syntetyczne wartości `attacked_at` jawnie, a `dungeon-truth.ts` czyta je jako fixture truth. Testy endpointu dowodzą zgodności API z przygotowanymi fixture'ami; nie dowodzą pochodzenia czasu w produkcyjnym scraperze.

Niezależny projekt `gge-assistant-bot` również pobiera `/dungeons/player/{playerId}` i sortuje rekordy po `attacked_at`. To tylko drugi klient tego samego GGE Tracker API, a nie niezależne źródło potwierdzające czas ataku.

Źródła — przypięte rewizje:
- `gge-tracker` `7d620820a76cde4176c752f6972ce6f0c9ad7ab1`: [scraper main.ts — refreshDungeonSquare, collectDungeonCooldowns, persistDungeonUpdates](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-internal-scraping/src/main.ts#L2118-L2278)
- [API dungeons — historia gracza i attacked_at](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts#L160-L235)
- [API dungeons — last_attack_at i last_attacker_id](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/src/api/routes/api-dungeons.ts#L600-L625)
- [Fixture scenario — jawne, syntetyczne attacked_at](https://github.com/gge-tracker/gge-tracker/blob/7d620820a76cde4176c752f6972ce6f0c9ad7ab1/gge-tracker-backend-api/tests/lib/dungeon-scenario.ts)
- [GGE Assistant — konsument tej samej historii API](https://github.com/nathael-aa/gge-assistant-bot/blob/91cb8a16d2175ddfbdd435c9b5eb87d178e0cc13/cogs/forteresses.py#L814-L900)

### Świeży probe publicznych źródeł PL1 — run 42215784484

Workflow `Probe PL1 fortress API` zakończył się SUCCESS dla commitu `e097dfa70aea3fb4bd6fe3763435ef89acbbeb80` (2026-11-06 12:11:38 UTC).

Testy:
- Python: 13/13 PASS.
- Node: 54/54 PASS, 0 failed.
- składnia skryptów i kontrakt przypiętego `ggejs`: PASS.
- test mobilnego UI Barony: PASS.
- katalog mapowy: 2021 unikalnych współrzędnych, bez pól ataku/cooldownu/gracza/gotowości.
- plan skanowania: 2021 celów, 199 sektorów 100×100, 1 990 000 potencjalnych pól.

Odczyty publiczne:
- produkcyjny PL1 TCP handshake: PASS, 175 ms; `payload_sent=false` — nie było logowania ani komend gry.
- `/servers/catalog`: `E4K_PL1 enabled=true, fortress=false, code=null`; `E4K_PL1_BETA enabled=true, fortress=true, code=null`.
- `/dungeons`: produkcyjny `E4K_PL1` HTTP 400 — serwer nie jest obsługiwany przez ten endpoint; `E4K_PL1_BETA` HTTP 200, 976 rekordów; IT1 HTTP 200, 2021 rekordów.
- Beta: 5 próbek historii graczy zwróciło łącznie 8477 rekordów. To wyłącznie diagnostyka Beta; żadnego z nich nie przypisano do PL1.
- W ośmiu próbkach timestampów Beta różnica `global_available_at - last_attack` wyniosła 86290–86393 s; w ośmiu próbkach IT1 86297–86395 s. Zgodność z okolicą 24h nie dowodzi czasu zdarzenia i nie jest przenoszona do PL1.
- most `/status`: HTTP 200, ale `target_connected=false`; GAM/GAA zostały pominięte.
- brak autoryzowanej sesji PL1, brak odczytu SNE/GAM z konta, brak potwierdzonego nowego ataku.

Workflow: https://github.com/marwlo-ops/Empirenew/actions/runs/42215784484

### Aktualna publikacja strony

Po poprzednim błędzie synchronizacji sprawdziłem najnowszy workflow Pages dla aktualnego wówczas main SHA `4d39b83322424ee08be5055aec2911d09ec8a11b`:

- build: SUCCESS;
- deploy: SUCCESS;
- report-build-status: SUCCESS.

Run: https://github.com/marwlo-ops/Empirenew/actions/runs/42219044713. To potwierdza publikację commitu `4d39b833...`, nie przyszłej zmiany dokumentacji z tej sekcji.

### Decyzja i następny krok

- Nie zmieniono kodu produkcyjnego w tej iteracji; dopisano wyłącznie audyt źródeł i wyniki testu do dziennika #barony.
- Nie dodano rekordów ataków PL1. `attack_time_utc` pozostaje null.
- Nie użyto cooldownów/historii IT1 ani Beta jako danych PL1.
- Nie zmieniono Mapa, Szpiegowania, Dodatkowe ani katalogu współrzędnych.
- Kolejny test rozstrzygający nadal wymaga lokalnego, autoryzowanego połączenia konta testowego z produkcyjnym PL1. Potrzebne są równoczesne odczyty GAA/GAM i raport NPC z MID/LID; poświadczenia muszą pozostać lokalne.


### Uzupełnienie walidacji dla commitu 6b2730d — 2026-11-06 13:02 UTC

Po dopisaniu sekcji 50 uruchomiono ponownie pełny workflow dla commitu `6b2730d9d3a83952135a806118a08c975552f20a`:

- Probe PL1 run `42221848566`: SUCCESS.
- Python: 13/13 PASS.
- Node: 54/54 PASS, 0 failed.
- walidacja metadanych przypiętego klienta E4K: PASS.
- mobilny test Barony: PASS.
- katalog mapowy: 2021 unikalne współrzędne, bez pól ataku/cooldownu/gracza/gotowości.
- plan: 2021 celów, 199 sektorów, 1 990 000 pól.
- TCP PL1: 175 ms, `payload_sent=false`.
- GGE Tracker: `E4K_PL1` nadal `fortress=false, code=null`, `/dungeons` HTTP 400; Beta 976 rekordów, IT1 2021.
- Beta: 5 próbek historii zwróciło 3571 rekordów — wyłącznie diagnostyka Beta.
- timestamp delta w próbkach Beta: 86291–86372 s; IT1: 86294–86398 s. Nie stanowią dowodu czasu ataku PL1.
- most: `target_connected=false`; GAM/GAA pominięte.
- potwierdzone ataki PL1: 0.

Pages run `42221847629` dla tego samego SHA zakończył się SUCCESS: build, report-build-status i deploy. Log potwierdza `Reported success!` oraz URL `https://marwlo-ops.github.io/Empirenew/`.

Źródła:
- https://github.com/marwlo-ops/Empirenew/actions/runs/42221848566
- https://github.com/marwlo-ops/Empirenew/actions/runs/42221847629
