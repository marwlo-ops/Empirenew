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
