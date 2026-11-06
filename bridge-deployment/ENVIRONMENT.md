# Zmienne środowiskowe mostu

Ustawiaj sekrety wyłącznie w panelu hostingu lub w ustawieniach sekretów GitHub Actions — nigdy w plikach repozytorium.

| Zmienna | Gdzie | Wymagana | Znaczenie |
|---|---|---:|---|
| USERNAME | Render | tak | Login osobnego konta gry używanego przez socket upstream |
| PASSWORD | Render | tak | Hasło tego konta |
| PORT | Render | dostarcza hosting | Port HTTP ustawiany przez Render |
| EMPIRE_API_TOKEN | Render | tak | Losowy token API; minimum 32 bajty; weryfikowany przez middleware |
| E4K_API_BASE | Empirenew Actions | po wdrożeniu mostu | Bazowy adres własnego mostu |
| E4K_API_TOKEN | Empirenew Actions | po wdrożeniu mostu | Ten sam token wysyłany jako Authorization: Bearer |

Wygeneruj token lokalnie, np. poleceniem Node.js:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

Wynik wklej bezpośrednio do pola sekretu w Render i — dopiero po uruchomieniu oraz sprawdzeniu middleware — do sekretu E4K_API_TOKEN w Empirenew Actions. Nie wpisuj go do terminala jako argumentu, pliku, commitu ani logu.

## Zachowanie autoryzacji

- GET / pozostaje publiczny wyłącznie jako health-check hostingu.
- /status i wszystkie trasy danych wymagają poprawnego Bearer tokenu.
- OPTIONS obsługuje wyłącznie CORS preflight i nie zwraca danych gry.
- Brak tokenu lub token krótszy niż 32 bajty powoduje HTTP 503 dla chronionych tras.
- Brak albo nieprawidłowy Bearer token powoduje HTTP 401.
- Porównanie tokenów używa crypto.timingSafeEqual; odpowiedzi błędów nie ujawniają sekretu.

Upstream danadum/empire-api nie ma tej autoryzacji domyślnie. Sama zmienna środowiskowa nie zabezpiecza serwera — wymagane jest uruchomienie apply-bridge-patch.mjs na przypiętym wariancie app.js oraz skopiowanie api-auth-middleware.js i map-command-queue.js do katalogu głównego forka.

Używaj osobnego konta gry przeznaczonego do integracji, jeśli regulamin gry i dostępne zabezpieczenia na to pozwalają. Nie używaj hasła do głównego konta.

Żądania GAA/FNM dla tej samej pary serwer+komenda są wykonywane kolejno. Zapobiega to przypisaniu odpowiedzi jednego żądania do innego, ponieważ upstream BaseSocket dopasowuje te odpowiedzi po samej nazwie komendy. Różne komendy mogą nadal działać równolegle.
