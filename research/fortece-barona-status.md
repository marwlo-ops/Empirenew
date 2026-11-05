# Fortecy i historia ataków — dziennik potwierdzonych testów

Ostatnia aktualizacja: 2026-11-05. Dane w tym dokumencie rozdzielają potwierdzone wyniki od hipotez i nierozwiązanych problemów.

## 1. Katalog mapy IT1

- Źródło: publiczne API GGE Tracker, `GET /api/v1/dungeons`, nagłówek `gge-server: IT1`.
- Odczyt na głównej gałęzi: 2026-11-05 14:00:35 UTC; ponowny odczyt w gałęzi PR: 2026-11-05 14:20:35 UTC.
- Wynik importera: strona 1/1, 2021 rekordów.
- Krainy: Piaski 671, Lód 779, Ogień 571.
- Walidacja opublikowanego JSON: 2021 rekordów, 0 duplikatów współrzędnych, 0 niepoprawnych współrzędnych.
- Każdy rekord zawiera wyłącznie identyfikator, KID, krainę, X/Y, typ i źródło IT1. Nie zawiera danych gracza, czasu ataku, cooldownu ani gotowości.
- Wszystkie rekordy są oznaczone jako źródło IT1; nie są zweryfikowane jako E4K PL1.

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
