# Zmienne środowiskowe mostu

Ustawiaj je wyłącznie w panelu hostingu — nigdy w plikach repozytorium.

| Zmienna | Wymagana | Znaczenie |
|---|---:|---|
| `USERNAME` | tak | Login konta gry używanego przez socket upstream |
| `PASSWORD` | tak | Hasło tego konta |
| `PORT` | dostarcza hosting | Port HTTP; Render ustawia go automatycznie |
| `EMPIRE_API_TOKEN` | tak, po dodaniu middleware | Losowy sekret wymagany przez własną warstwę autoryzacji API |

**Uwaga:** upstream `danadum/empire-api` w aktualnym kodzie nie sprawdza `EMPIRE_API_TOKEN`. Dodanie samej zmiennej w Render niczego nie zabezpiecza. Przed publicznym uruchomieniem dodaj middleware sprawdzające nagłówek `Authorization: Bearer <token>` na wszystkich trasach API, w tym `/status`. Nie loguj wartości nagłówka.

Używaj osobnego konta gry przeznaczonego do integracji, jeśli regulamin gry i dostępne zabezpieczenia na to pozwalają. Nie używaj hasła do głównego konta w testach ani w repozytorium.
