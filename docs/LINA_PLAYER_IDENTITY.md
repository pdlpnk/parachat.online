# LINA — Stage 2 Player Identity

This is the current identity contract; the Stage 1 foundation documents retain their original audit/history.
Product LINA, repository Chat WEB. No Stage 3 send/polling/admin or production deployment.

## Runtime configuration

`DATABASE_URL`, `CLIENT_CREDENTIAL_PEPPER` (32 random bytes encoded as 64 hex), and `LINA_ORIGIN` are required.
`LINA_ORIGIN` is the exact canonical browser origin without a trailing slash. HTTPS is required except for
loopback development/test origins. Do not derive trust from incoming Host or forwarded headers.
All instances must share the same stable pepper. Changing it invalidates every existing player credential
and bootstrap; no automatic rotation is implemented. Use an independently generated secret, never sample values.
Build/Prisma generation remain offline and secret-free. No NEXT_PUBLIC identity configuration exists.

## Protocol and guarantees

1. GET `/` reads the credential server-side and performs no creation or lastSeen/lastUsed write.
   A valid identity renders Messenger immediately. An anonymous visitor sees only the RU name form.
   DB errors show a neutral temporary-unavailability screen instead of pretending an authenticated visitor is new.
2. The form prepares POST `/api/player/bootstrap` inside the origin-wide Web Lock `lina-player-start`.
   No Client is created. Invalid client cookies are cleared. A valid bootstrap is preserved without extending its age.
   Revoked/expired committed bootstraps are replaced with new attempts; old credentials remain unusable.
3. Bootstrap is 68 bytes encoded as 91 base64url characters: random 12-byte IV, 40 encrypted bytes, 16-byte GCM tag.
   Plaintext consists of an 8-byte issued-at timestamp and a CSPRNG 32-byte future client token.
   AES-256-GCM authenticates both payload and fixed purpose/version AAD. The AES key is derived from the pepper by
   HMAC with a distinct bootstrap purpose. The bootstrap cookie does not expose the future token and is not accepted
   by session resolution. Server expiry is 15 minutes; invalid encoding, tampering, wrong key, future date or expiry fail closed.
4. Submit holds that same Web Lock across prepare + POST `/api/player/start`. Other tabs first see the already-installed
   cookie and return the existing client. This prevents races when several tabs initially have no bootstrap cookie.
   Web Locks and JavaScript are required for the supported UI; unsupported/insecure browsers get an explicit error.
   There is no unsafe cross-tab fallback. This browser coordination supplements, but does not replace, database idempotency.
5. Start requires exact Origin and rejects Sec-Fetch-Site=cross-site. Only JSON is accepted; streamed body is limited to
   2048 bytes even without Content-Length. Only displayName is used; supplied ID, emoji or author fields have no authority.
   Name is trimmed, NFC-normalized, 1–80 Unicode code points; controls, formatting characters (including zero-width/bidi),
   lone surrogates and whitespace/combining-mark-only strings are rejected. Duplicate names are legal.
6. Start decrypts the bootstrap and computes HMAC-SHA256(pepper bytes, raw base64url credential). It opens a Read Committed
   DB transaction and acquires pg_advisory_xact_lock on the signed first 64 bits of that keyed hash. Independent Node processes
   serialize for the same attempt. An incidental 64-bit lock collision only slows independent attempts; full unique hashes
   remain authoritative. Expiry is checked again after waiting for the lock.
7. Existing valid hash + same normalized name returns the original token and original expiry. Changed-name replay returns
   409; expiry/revocation returns 409 and never renews or resurrects a credential. A valid installed client cookie takes
   precedence in the HTTP endpoint and returns its existing identity regardless of a stale form.
8. A new attempt also takes a separate two-integer PostgreSQL advisory lock for the shared creation ceiling. If 120 credential
   rows were created within the preceding minute, return 429 with Retry-After: 60. Committed retries skip this ceiling.
9. In one transaction: insert Client with DB-generated LI and a private random temporary emoji; replace emoji using the
   existing mapping and persist it; insert one Conversation; insert one structured welcome; insert only the keyed credential
   hash with expiry. The temporary emoji never escapes the transaction. Deferred conversation constraints and existing
   message sequence trigger remain intact. Any failure rolls back every row, while the LI sequence may consume a number.
10. After commit return only `{ok:true}` and Set-Cookie. The raw client token is only in the HttpOnly credential cookie.
    Clear bootstrap in the same response. Navigate to `/` for confirmed SSR Messenger, not optimistic UI.

Cookie production names: `__Host-lina_client`, `__Host-lina_bootstrap`. Both HttpOnly, Secure, SameSite=Lax, Path=/, no Domain.
Development/test names: `lina_client`, `lina_bootstrap`, same attributes except Secure=false for local HTTP.
Credential expires 365 days after creation; retries retain the original absolute expiry and do not extend lifetime.
This supports same-browser long-lived identity; cookie deletion, expiry or loss has no cross-device/name/LI recovery.

## Commit versus Set-Cookie

The server can reproduce the original raw token by decrypting the still-installed bootstrap after a lost response;
it does not need a plaintext/encrypted-token database column or ClientStartAttempt table. The unique credentialHash row
is the durable binding, and the transaction lock prevents duplicate creation. Tests also use two real Node processes.
Replay is bounded to the bootstrap's original 15-minute window. After that window, if no client cookie was installed,
identity cannot be recovered and a new Start is a new visitor. Partial browser cookie application that loses both cookies
has the same limitation. Indefinite recovery would contradict a short-lived bootstrap and requires a separate product decision.
An attacker who steals a live bootstrap can replay it within that window; protect it like a short-lived bearer secret.
It is never placed in JS, URLs, response JSON, localStorage, sessionStorage or logs.

## Session and display boundaries

Resolution queries ClientCredential only, never AdminSession, displayName, public LI or caller-supplied client UUID.
Malformed/missing/unknown/revoked/expired tokens are anonymous. SQL lookup uses the keyed hash; no application token-string
comparison is needed. GCM authentication is handled by Node's crypto library. No activity write occurs on renders.
Invalid-cookie cleanup occurs on the same-origin bootstrap POST initiated by the landing, not in a React render.
With JavaScript disabled the invalid cookie persists harmlessly until expiry; GET still remains anonymous and never creates data.

Explicit DTO: displayName, liId, stored avatarEmoji, locale, and SYSTEM messages with sequence and resolved text.
No internal IDs, tags, admins, hashes, secrets or raw JSON system params enter the client-facing DTO.
The current page is server-rendered; authenticated UI has no identity-bearing client-component props.
`system.welcome` stores `{name}`, sourceLocale RU, null authors/body. The resolver validates scalar name and has a neutral
fallback. React renders text with escaping; no raw HTML. Welcome sequence is 1, firstUserMessageAt/lastMessageAt stay null.
No USER message, activation, read marker or composer action exists.

## Abuse protection and deployment boundary

The PostgreSQL ceiling is shared and race-safe, but intentionally coarse: it is a global new-identity safety cap, not a fair
per-IP limiter or a complete DoS defense. A busy/attacked service can temporarily deny legitimate new Starts. Existing
sessions/retries remain available. Before exposure, a trusted ingress must bound requests per IP for bootstrap/start,
connection concurrency and body-read duration, and strip untrusted forwarding headers. These are deployment requirements;
no proxy, Redis, IP trust guessing or production configuration is introduced now. The sole additive migration indexes
ClientCredential.createdAt for the ceiling query. The initial migration is unchanged.

## Verification

Run README quality gates and `tests/http/player-smoke.mjs` after production build. The HTTP harness starts two loopback-only
standalone processes, generates a temporary pepper in memory, asserts behavior without printing tokens and stops processes.
DB tests require the explicit disposable-local guard and run files serially because Stage 1 truncates fixture tables.
Real-device software keyboard and iOS safe-area behavior still need device QA; viewport simulation is not a physical device.
