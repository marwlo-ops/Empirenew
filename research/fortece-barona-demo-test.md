# Lokalny test konta demo — Barony / E4K PL1

Ten test jest przygotowany do uruchomienia lokalnie przez operatora. Nie umieszczaj loginu ani hasła w rozmowie, repozytorium, plikach .env, GitHub Actions ani logach.

## Warunki

- Konto demo musi być na produkcyjnym E4K PL1 (EmpirefourkingdomsExGG_3), jeśli wyniki mają być dowodem dla produkcyjnego PL1.
- Konto E4K_PL1_BETA jest osobnym środowiskiem i nie może potwierdzać danych produkcyjnego PL1.
- Probe jest tylko do odczytu: odczytuje próbkę mapy, opcjonalnie ruchy GAM widoczne dla zalogowanego konta i raporty NPC z jego skrzynki. Nie wysyła ataków, szpiegowania ani wiadomości.
- Probe zapisuje lokalny stan obserwacji poza repozytorium. Nie zapisuje automatycznych zdarzeń ataków; dokładny czas ataku pozostaje null, dopóki nie zostanie potwierdzone źródło serwerowe.

## Windows PowerShell

Uruchom z katalogu głównego repozytorium:

```powershell
npm install --prefix scripts/barony-live --ignore-scripts --no-audit --no-fund
node scripts/barony-live/prepare-e4k-data.mjs

$env:E4K_USERNAME = Read-Host "Login konta demo"
$securePassword = Read-Host "Haslo konta demo" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:E4K_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$state = Join-Path $env:TEMP "empirenew-barony-demo-state.json"
node scripts/barony-live/probe.mjs --samples-per-kingdom 3 --state-file $state --movements --reports

Remove-Item Env:E4K_USERNAME -ErrorAction SilentlyContinue
Remove-Item Env:E4K_PASSWORD -ErrorAction SilentlyContinue
```

Jeśli chcesz najpierw sprawdzić tylko mapę, pomiń flagi --movements --reports. Wtedy probe nie pobiera ruchów ani skrzynki raportów.

## macOS / Linux

```bash
npm install --prefix scripts/barony-live --ignore-scripts --no-audit --no-fund
node scripts/barony-live/prepare-e4k-data.mjs
read -r -p "Login konta demo: " E4K_USERNAME
read -r -s -p "Haslo konta demo: " E4K_PASSWORD; echo
export E4K_USERNAME E4K_PASSWORD
export BARONY_STATE_FILE="${TMPDIR:-/tmp}/empirenew-barony-demo-state.json"
node scripts/barony-live/probe.mjs --samples-per-kingdom 3 --state-file "$BARONY_STATE_FILE" --movements --reports
unset E4K_USERNAME E4K_PASSWORD
```

## Jak przekazać wynik

Przekaż wyłącznie zredagowany raport JSON z konsoli. Usuń identyfikator konta, login, nazwy graczy i inne dane, których nie chcesz udostępniać. Nie przesyłaj pliku stanu, jeśli zawiera dane, których nie chcesz ujawniać.

Do sprawdzenia zmiany defeaterPlayerId potrzebne są dwie próbki tej samej fortecy: przed i po rzeczywistym, ręcznie wykonanym ataku na koncie demo. Probe sam nie wykonuje ataku. Przed takim testem trzeba uzgodnić konkretną lokację i osobno potwierdzić, że wykonanie ataku jest dozwolone.

Nawet po takim teście zmiana cooldownu/ID gracza może potwierdzić tylko przedział obserwacji i powiązanie celu. Dokładny attacked_at wymaga osobnego, potwierdzonego timestampu serwerowego.
