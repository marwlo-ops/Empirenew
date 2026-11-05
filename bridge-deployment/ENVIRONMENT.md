# Zmienne środowiskowe mostu

Ustawiaj je wyłącznie w panelu hostingu — nigdy w plikach repozytorium.

| Zmienna | Wymagana | Znaczenie |
|---|---:|---|
| `USERNAME` | tak | Login konta gry używanego przez socket upstream |
| `PASSWORD` | tak | Hasło tego konta |
| `PORT` | dostarcza hosting | Port HTTP; Render ustawia go automatycznie |
| `EMPIRE_API_TOKEN` | tak, po dodaniu middleware | Losowy sekret wymagany przez własną warstwę autoryzacji API |
| `E4K_API_TOKEN` | w Empirenew Actions, jeśli most jest zabezpieczony | Ten sam sekret przekazywany jako nagłówek Bearer do skanera |

**Uwaga:** upstream `danadum/empire-api` w aktualnym kodzie nie sprawdza `EMPIRE_API_TOKEN`. Dodanie samej zmiennej w Render niczego nie zabezpiecza. Własny most musi mieć middleware sprawdzające nagłówek `Authorization: Bearer <token>` na wszystkich trasach danych i `/status`; sama ścieżka `/` może pozostać publiczna dla health-checka. Skaner Empirenew wysyła `E4K_API_TOKEN` jako Bearer. Nie ustawiaj sekretu, dopóki middleware nie jest wdrożone i przetestowane. Nie loguj wartości nagłówka.

Używaj osobnego konta gry przeznaczonego do integracji, jeśli regulamin gry i dostępne zabezpieczenia na to pozwalają. Nie używaj hasła do głównego konta w testach ani w repozytorium.
