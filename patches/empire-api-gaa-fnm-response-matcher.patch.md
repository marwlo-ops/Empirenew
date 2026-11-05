# Patch for the external empire-api bridge

This patch is intended for the upstream repository `danadum/empire-api`, file `app.js`. It is **not** an Empirenew runtime change: Empirenew does not control the deployed `empire-api.fly.dev` service.

## Why

For commands absent from `data/commands.json`, upstream currently uses the entire request header object as the response matcher. Map responses for `gaa` and `fnm` need not echo all request coordinates/filter fields. Upstream also hardcodes a 1,000 ms response timeout. Both behaviors can make a valid map response appear as HTTP 400.

## Patch

```diff
*** Begin Patch
*** Update File: app.js
@@
-                    let responseHeaders = {};
-                    if (req.params.command in commands) {
+                    let responseHeaders = {};
+                    // Map responses do not necessarily echo the request's
+                    // coordinate/filter fields. Match these commands by name only.
+                    if (["gaa", "fnm"].includes(req.params.command)) {
+                        responseHeaders = false;
+                    } else if (req.params.command in commands) {
                         for (const [messageKey, responsePath] of Object.entries(commands[req.params.command])) {
                             if (messageKey in messageHeaders) {
                                 setNestedValue(responseHeaders, responsePath, messageHeaders[messageKey]);
                             }
@@
-                    const response = await sockets[req.params.server].socket.waitForJsonResponse(req.params.command, responseHeaders, timeout = 1000);
+                    const responseTimeout = ["gaa", "fnm"].includes(req.params.command) ? 15000 : 1000;
+                    const response = await sockets[req.params.server].socket.waitForJsonResponse(req.params.command, responseHeaders, responseTimeout);
*** End Patch
```

## Validation required after upstream deployment

1. Call `gaa` against `EmpirefourkingdomsExGG2_3` with a small bounded area.
2. Confirm HTTP 200 and `return_code == 0`.
3. Inspect the raw `content` shape and identify the actual map-object records.
4. Call `fnm` separately and compare its output with map records.
5. Validate NPC/baron type IDs against the official game session before writing any coordinates.
6. Repeat for KID values corresponding to Sands, Ice, and Fire.

Do not populate `data/baron-fortresses.json` from guessed numeric type IDs or from BETA data. Keep the existing fail-safe snapshot gate enabled.
