# GGE Assistant / GGE Tracker fallback for #baron

This integration adapts the **read-only public API pattern** used by [GGE Assistant](https://github.com/nathael-aa/gge-assistant-bot), specifically its fortress cog. It does not copy the Discord bot or its credentials.

## Run locally

From the Empirenew repository root:

```sh
node scripts/barony-live/gge-tracker-fallback.mjs > barony-tracker-check.json
```

Optional environment variables:

- `GGE_SERVER` — server header, defaults to `E4K_PL1`.
- `GGETRACKER_API_KEY` — optional API key; never commit it.
- `GGETRACKER_BASE_URL` — API base URL override for controlled diagnostics.
- `BARONY_TRACKER_TIMEOUT_MS` — request timeout, 1000–30000 ms; defaults to 8000.

## What it does

- Reads the existing IT1 coordinate catalog only as a list of candidate coordinates explicitly aligned to PL1 by the operator.
- Requests `/dungeons/meta` and the `/dungeons` endpoint separately for Sands, Ice and Fire.
- Matches returned rows against exact `kid:X:Y` coordinates.
- Reports last-king/source fields and cooldown status when present.
- Emits explicit HTTP/API/shape errors and marks absent matches as **not confirmed**, never as proof that a fortress is absent.
- Does not persist state, connect to the game, send game commands, or infer an attack time from `last_attack` or cooldown.

## Important limitation

The previous PL1 diagnostic found that the public GGE Tracker fortress endpoint could return HTTP 400 / `fortress=false`. This adapter is a way to retest that public source with explicit per-kingdom diagnostics; it does **not** bypass the API's server coverage or guarantee PL1 results. A successful HTTP response also does not prove global or real-time completeness.

The existing `probe.mjs` authenticated, read-only game-client probe remains the independent source for live map observations. Keep its limitations: it samples only the requested sectors and account-visible movement/mailbox evidence is not a global attack feed.

## Safety and scope

The new files are supplemental. They do not change the protected `Mapa`, `Szpiegowanie`, `Dodatkowe`, `barony.html`, `mapa-rb.html`, or fortress coordinate catalog. Review results before wiring them into the production UI; do not publish unverified rows as confirmed attacks.
