# NPC map bridge diagnosis and safe rollout

## Verified source behavior

The public `danadum/empire-api` bridge currently builds response matchers in
`app.js` like this:

- If the command exists in `data/commands.json`, it maps request fields to
  configured response paths.
- Otherwise it uses the *entire request object* as the response matcher.

The same bridge's `BaseSocket.waitForJsonResponse()` passes that matcher to
`compareNestedHeaders()`. This is a problem for map commands: the documented
`pygge` implementation calls `wait_for_json_response("gaa")` and
`wait_for_json_response("fnm")` without matching request parameters. Map
responses are not required to echo `KID/AX1/AY1/AX2/AY2` or
`T/KID/LMIN/LMAX/NID`.

The upstream bridge therefore needs an explicit "match command only" rule.
A minimal upstream patch in `app.js` is:

```js
let responseHeaders = {};
if (["gaa", "fnm"].includes(req.params.command)) {
    responseHeaders = false;
} else if (req.params.command in commands) {
    for (const [messageKey, responsePath] of Object.entries(commands[req.params.command])) {
        if (messageKey in messageHeaders) {
            setNestedValue(responseHeaders, responsePath, messageHeaders[messageKey]);
        }
    }
} else {
    responseHeaders = messageHeaders;
}
```

This matches the documented `pygge` behavior: `false` means accept the first
JSON response for the requested command, without requiring echoed parameters.
The upstream bridge is maintained by another owner; this repository cannot
deploy that change to `empire-api.fly.dev`. Do not claim the remote service is
fixed until its owner deploys the patch.

## Diagnostic

`scripts/scan_npc_map.py` makes read-only requests to `gaa` and `fnm`.
It encodes JSON members without outer braces because `app.js` reconstructs
the JSON object around the route parameter. It logs HTTP status, return code,
and response preview. It does not assume that a HTTP 200 alone proves a map
result.

## Snapshot protection

The script writes a snapshot only when it identifies at least one object with
explicit NPC/baron/dungeon/fortress/camp labeling and validated integer X/Y.
Opaque numeric type IDs are not guessed. Writes use a temporary file and
atomic replacement. If the bridge returns HTTP 400, a game error, unknown
schema, or zero verified NPCs, the requested production snapshot is untouched.

## Manual test

Run the GitHub Actions workflow `NPC map API diagnostics` with kingdom 1 and
a small 12x12 chunk. Inspect the uploaded `npc-map-diagnostic` artifact.
Do not enable scheduled production scanning until a PL1 response is validated
and the real response schema and NPC type markers are confirmed.


## Live PL1 diagnostic — 2026-11-05

The new GitHub Actions probe ran against `EmpirefourkingdomsExGG2_3`
with a 12x12 `gaa` request and an `fnm` request for kingdom 1.

Observed result for both commands:

- HTTP 400
- response body: `{"error":"Invalid command or headers"}`
- zero validated NPC objects
- no production snapshot was written

The error text is deliberately generic: the upstream Express handler catches
both parsing errors and socket/response wait errors and returns the same HTTP
400. Therefore the live result confirms that the current public bridge cannot
serve these two requests, but does not by itself prove which internal error
was thrown.

A further source detail matters: the upstream route hardcodes a 1,000 ms
response timeout. The diagnostic must be repeated after the upstream patch
and, if necessary, after increasing that timeout for map responses. The
`gaa` map response may be larger/slower than ordinary profile commands.

## Proposed upstream code change

In `danadum/empire-api/app.js`, retain the existing `sendJsonCommand` call,
but replace response matcher construction and timeout selection with:

```js
let responseHeaders = {};
if (["gaa", "fnm"].includes(req.params.command)) {
    responseHeaders = false;
} else if (req.params.command in commands) {
    for (const [messageKey, responsePath] of Object.entries(commands[req.params.command])) {
        if (messageKey in messageHeaders) {
            setNestedValue(responseHeaders, responsePath, messageHeaders[messageKey]);
        }
    }
} else {
    responseHeaders = messageHeaders;
}

const responseTimeout = ["gaa", "fnm"].includes(req.params.command) ? 15000 : 1000;
const response = await sockets[req.params.server].socket.waitForJsonResponse(
    req.params.command,
    responseHeaders,
    responseTimeout
);
```

The `false` matcher is supported by `BaseSocket._processResponse()`: it
accepts a JSON response when the command matches, without requiring the
response data to echo request parameters. The longer timeout is specific to
the map commands. This patch must be deployed by the owner of the external
bridge; it has not been deployed by this repository.

## Actions run

- Diagnostic run: `41946766958`
- Artifact: `npc-map-diagnostic` (506 bytes)
- The run correctly failed its validation gate; the report confirms both
  commands returned HTTP 400 and no snapshot was changed.
