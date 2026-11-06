# Własny most Empire API — bezpieczny pakiet wdrożeniowy

Ten katalog zawiera patch i testy dla forka danadum/empire-api. Nie jest wdrożoną usługą i nie daje jeszcze potwierdzonego odczytu mapy PL1.

## Co poprawia pakiet

1. Dodaje obowiązkową autoryzację Bearer dla /status i wszystkich tras danych.
2. Pozostawia publiczny wyłącznie GET / jako health-check hostingu.
3. Obsługuje CORS Authorization i bezpieczne preflight OPTIONS.
4. Dla gaa i fnm dopasowuje odpowiedź wyłącznie po nazwie komendy, zamiast wymagać echa parametrów żądania.
5. Wydłuża timeout odpowiedzi gaa/fnm do 15 sekund; pozostałe komendy zachowują 1 sekundę.
6. Ogranicza trasę danych do komend `gaa`, `fnm` i `gam`; wszystkie inne polecenia są odrzucane HTTP 403.
7. Ogranicza zarówno trasę HTTP, jak i tworzone sockety do produkcyjnego `EmpirefourkingdomsExGG_3`. Pozostałe serwery E4K i wszystkie sockety GGE nie są łączone; jeśli nie powstanie dokładnie jeden socket PL1, proces startuje błędem.

Middleware wymaga tokenu o długości co najmniej 32 bajtów, porównuje go przez crypto.timingSafeEqual i działa fail-closed. Patch loguje wyłącznie typ błędu, a nie surowy komunikat upstream. Brak lub zbyt krótki token zwraca HTTP 503 na trasach chronionych; brak/błędny token zwraca HTTP 401.

## Zawartość

- api-auth-middleware.js — moduł autoryzacji, który należy skopiować do katalogu głównego forka.
- api-auth-middleware.test.js — testy middleware.
- map-command-queue.js — kolejka serializująca żądania GAA/FNM dla tego samego serwera i komendy.
- read-only-commands.js — wąska lista dozwolonych komend mapy/ruchów (`gaa`, `fnm`, `gam`).
- read-only-commands.test.js — testy odrzucania komend spoza listy.
- map-command-queue.test.js — testy kolejności, równoległości różnych komend i odzyskiwania po błędzie.
- apply-bridge-patch.mjs — guarded script, który modyfikuje dokładnie przypięty wariant upstream `app.js` i `utils/ws/sockets.js`.
- render.yaml — blueprint Render z wymaganymi sekretami.
- ENVIRONMENT.md — konfiguracja i zasady przechowywania sekretów.

Skrypt jest weryfikowany w CI względem upstream danadum/empire-api przypiętego do commitu dc2e8c459a87d13a30d423b03bbbd8774f7f7b3d. Wymaga dokładnie jednego wystąpienia każdego oczekiwanego fragmentu i odmawia zapisu, jeśli upstream zmienił strukturę. Po zmianie upstream najpierw przejrzyj diff i zaktualizuj testy.

## Kolejność wdrożenia

1. Wykonaj fork danadum/empire-api.
2. Skopiuj api-auth-middleware.js, map-command-queue.js i read-only-commands.js do katalogu głównego forka.
3. Uruchom `node bridge-deployment/apply-bridge-patch.mjs <path-to-fork/app.js>`; skrypt ogranicza też `utils/ws/sockets.js` do jednego socketu PL1. Sprawdź składnię obu zmienionych plików.
4. Uruchom testy obu modułów z pakietu (node --test bridge-deployment/*.test.js bridge-deployment/*.test.mjs).
5. W Render ustaw USERNAME, PASSWORD i EMPIRE_API_TOKEN zgodnie z ENVIRONMENT.md.
6. Przed podłączeniem Empirenew sprawdź:
   - GET / bez tokenu — HTTP 200;
   - GET /status bez tokenu — HTTP 401;
   - GET /status z tokenem — HTTP 200;
   - brak/krótki token serwera — HTTP 503 na trasie chronionej;
   - read-only gaa, fnm i gam z rzeczywistą odpowiedzią gry; każda inna komenda musi zwracać HTTP 403.
7. Potwierdź z wdrożonej usługi wychodzące TCP do hosta PL1 i zachowanie po reconnect/re-login.
8. Dopiero po tych testach ustaw sekrety E4K_API_BASE i E4K_API_TOKEN w Empirenew Actions.

## Ograniczenia i kryterium odbioru

- Render Free może usypiać usługę; sam keep-alive HTTP nie odtwarza sesji SmartFoxServer.
- Nie potwierdzono jeszcze stabilnego reconnect/re-login ani działającej odpowiedzi GAA/FNM na produkcyjnym PL1.
- Skrypt nie łączy innych światów: `getSockets()` musi zwrócić dokładnie jeden socket `EmpirefourkingdomsExGG_3`, inaczej start jest przerywany.
- Nie publikuj mostu bez autoryzacji i nie umieszczaj loginu, hasła, tokenu API ani tokenów sesji w repozytorium lub logach.
- KID i współrzędne w ręcznych próbach są parametrami diagnostycznymi, dopóki nie zostaną potwierdzone na żywej mapie PL1.
- Dane Beta/IT1 nie mogą być używane jako historia ataków produkcyjnego PL1.

Wdrożenie uznajemy za działające dopiero po poprawnym, autoryzowanym odczycie hgh, gaa i fnm z produkcyjnego PL1 oraz weryfikacji surowych pól odpowiedzi. Nawet wtedy GAA/FNM potwierdzają mapę, a nie automatycznie historię „kto i kiedy zaatakował”.
