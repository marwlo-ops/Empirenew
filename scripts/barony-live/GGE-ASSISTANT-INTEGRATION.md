# GGE Assistant / GGE Tracker fallback for #baron

This integration adapts the **read-only public API pattern** used by [GGE Assistant](https://github.com/nathael-aa/gge-assistant-bot), specifically its fortress cog. It does not copy the Discord bot or its credentials.

## Run locally

From the Empirenew repository root:

```sh
node scripts/barony-live/gge-tracker-fallback.mjs > barony-tracker-check.json
```

Optional environment variables:

- `GGE_SERVER` — defaults to `E4K_PL1`; any other value is rejected so Beta cannot be mistaken for production.
- `GGETRACKER_API_KEY` — optional API key; never commit it. It is sent only to `api.gge-tracker.com`.
- `GGETRACKER_BASE_URL` — HTTP(S) base URL override for controlled diagnostics; credentials, query strings and fragments are rejected.
- `BARONY_TRACKER_TIMEOUT_MS` — request timeout, 1000–30000 ms; defaults to 8000.

## What it does

- Reads the existing IT1 coordinate catalog only as a list of candidate coordinates explicitly aligned to PL1 by the operator.
- Validates the catalog with the same strict map-only validator used by the live Barony probe.
- Requests `/dungeons/meta` and the `/dungeons` endpoint separately for Sands, Ice and Fire.
- Follows every declared page (maximum 20) and requires consistent pagination metadata and item counts before marking a kingdom complete.
- Limits each response body to 8 MiB and never copies upstream HTTP error bodies into diagnostics.
- Matches returned rows against exact `kid:X:Y` coordinates. Duplicate matches are marked ambiguous; a missing row is only reported as not confirmed after a complete page scan.
- Reports tracker actor/last-attack values as **unverified source fields**. `attack_time_utc` remains null.
- Does not persist state, connect to the game, send game commands, or infer an attack time from `last_attack` or cooldown.

## Important limitation

The previous PL1 diagnostic found that the public GGE Tracker fortress endpoint could return HTTP 400 / `fortress=false`. This adapter is a way to retest that public source with explicit per-kingdom diagnostics; it does **not** bypass the API's server coverage or guarantee PL1 results. A successful HTTP response does not prove global or real-time completeness. If pagination is missing, inconsistent or truncated, the kingdom is marked incomplete and all its locations remain source-unavailable rather than being called absent.

The existing `probe.mjs` authenticated, read-only game-client probe remains the independent source for live map observations. Keep its limitations: it samples only the requested sectors and account-visible movement/mailbox evidence is not a global attack feed.

## Safety and scope

The adapter is supplemental and local-only. It does not change the protected `Mapa`, `Szpiegowanie`, `Dodatkowe`, `barony.html`, `mapa-rb.html`, or fortress coordinate catalog. Do not wire its actor/timestamp fields into the production UI as confirmed attacks. IT1/Beta data must never be substituted for production PL1.
