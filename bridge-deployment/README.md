# Własny most Empire API — pakiet wdrożeniowy

Ten katalog jest instrukcją i zestawem plików pomocniczych dla forka `danadum/empire-api`. Nie jest samodzielnym serwerem i nie zastępuje kodu upstream.

## Co potwierdzono w kodzie upstream

- Serwer startuje przez `npm start` (skrypt uruchamia `server.js`).
- Poświadczenia gry są odczytywane ze zmiennych `USERNAME` i `PASSWORD`.
- Port HTTP pochodzi z `process.env.PORT`, domyślnie 3000.
- `server.js` pobiera konfigurację sieci E4K z Goodgame Studios i tworzy sockety dla znalezionych serwerów.
- Sockety są okresowo restartowane; to nie jest gwarancja ponownego logowania po każdym zerwaniu sesji.
- `BaseSocket.waitForJsonResponse(command, false, timeout)` rzeczywiście oznacza dopasowanie wyłącznie po nazwie komendy. Jest to potwierdzone w `utils/ws/baseSocket.js`.

## Pliki

- `app.js.patch` — patch dla `gaa` i `fnm`: dopasowanie odpowiedzi tylko po komendzie oraz timeout 15 s.
- `render.yaml` — blueprint Render korzystający z istniejącego Dockerfile upstream.
- `ENVIRONMENT.md` — wymagane zmienne i zasady bezpieczeństwa.

## Kolejność wdrożenia

1. Zaloguj się do GitHub i wykonaj Fork repozytorium https://github.com/danadum/empire-api.
2. W swoim forku zastosuj `app.js.patch` do pliku `app.js`. Nie nadpisuj całego repozytorium.
3. Utwórz usługę Render z repozytorium forka i plikiem `render.yaml` z tego katalogu (albo skopiuj jego zawartość do głównego katalogu forka jako `render.yaml`).
4. W Render > Environment ustaw `USERNAME`, `PASSWORD` oraz `EMPIRE_API_TOKEN` zgodnie z `ENVIRONMENT.md`.
5. Nie udostępniaj endpointu produkcyjnie, dopóki nie dodasz weryfikacji `EMPIRE_API_TOKEN` w middleware aplikacji. Samo ukrycie adresu URL nie jest zabezpieczeniem.
6. Sprawdź `/status`, następnie wykonaj testy `hgh`, `gaa` i `fnm` z tokenem API.
7. Dopiero po pozytywnych testach ustaw w repozytorium Empirenew sekret Actions `E4K_API_BASE` na adres nowego endpointu.

## Ograniczenia

- Render Free usypia bezczynne usługi. Nie zakładaj, że utrzyma stale aktywne połączenie TCP do gry.
- Keep-alive HTTP nie odtwarza sesji SmartFoxServer. Potrzebna jest kontrola stanu socketu i bezpieczny reconnect/re-login; tego pakiet nie deklaruje jako gotowego.
- Render musi pozwalać na wymagane wychodzące połączenia TCP do hostów gry na porcie 443. Potwierdź to testem z wdrożonej usługi.
- Nie wpisuj loginu, hasła, tokenu API ani tokenów sesji do plików repozytorium, logów Actions lub zgłoszeń.
- Identyfikatory KID są parametrami testowymi, nie zatwierdzoną tabelą krain.
- Błąd HTTP 400 z publicznego mostu jest niejednoznaczny: może oznaczać błąd parsowania, wysłania komendy lub timeoutu odpowiedzi.

## Kryterium odbioru

Wdrożenie uznajemy za działające dopiero wtedy, gdy nowy endpoint zwróci:
- poprawne `hgh` dla produkcyjnego PL1;
- odpowiedź `gaa` z rzeczywistą tablicą mapy;
- odpowiedź `fnm` bez timeoutu;
- surowe rekordy, których znaczenie i pola współrzędnych da się potwierdzić.

Brak danych lub nieznany typ obiektu oznacza brak zapisu współrzędnych. Nie używamy danych BETA jako danych PL1.
