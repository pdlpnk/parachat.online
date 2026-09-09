# LINA — Stage 3 Player Messenger contract

Stage 1 identity/schema invariants and Stage 2 bootstrap/cookies remain authoritative. Stage 2.5's palette, responsive shell and bubble styles are retained. This document describes the live player side; no Admin functionality or production infrastructure is introduced.

## API and ownership

Every message endpoint authenticates the existing HttpOnly client credential using HMAC and resolves its permanent Conversation on the server. Client/Conversation IDs, authors, LI IDs, sequence, timestamps and keys in JSON are never accepted as authority. No endpoint creates a Client. Missing/unknown/malformed/revoked/expired sessions receive 401, with an explicit refresh action in the UI.

- `POST /api/player/messages`: JSON exactly `{ "text": "…" }`, required `Idempotency-Key` header: lowercase canonical UUID v4, produced by browser `crypto.randomUUID()`. Success 200 `{ "message": MessageDTO }` for both creation and replay.
- `GET /api/player/messages?after=0`: exactly one canonical nonnegative integer cursor, at most PostgreSQL Int max. Returns `{ messages, hasMore, readSequence, unreadCount }` with sequence > cursor in ascending order. Batch 100, one extra row determines hasMore.
- `POST /api/player/read`: JSON exactly `{ "sequence": 42 }`, positive existing message sequence within the authenticated Conversation. Success `{ readSequence }` is the canonical monotonic maximum.

MessageDTO contains **only** `sequence`, `authorType`, `text`, `createdAt` (UTC ISO string). All SQL/Prisma rows and IDs stay server-side. SYSTEM key/params pass through the existing trusted resolver; unknown keys return neutral text. USER/OPERATOR bodies are React-escaped plaintext, never HTML. No translation work or operator send endpoint exists.

POSTs reuse Stage 2 exact `LINA_ORIGIN` and reject cross-site Fetch Metadata; GET is authenticated and non-mutating. Responses, including failures, use `Cache-Control: no-store`. Errors: 400 invalid fields/text/key/cursor, 401 session, 403 Origin, 409 conflicting key, 413 body limit, 415 content type, 429 rate ceiling with Retry-After 60, sanitized 503 infrastructure failure.

## Text and request limits

Normalize CRLF/CR to LF, trim outer whitespace, normalize NFC. Count Unicode scalar values after normalization: 1–5000, allowing multilingual text, tabs, multiline, emoji and ZWJ sequences. Reject lone surrogates, disallowed controls and strings consisting only of separators/formatting/combining characters. A 20,000 UTF-16 input precheck bounds normalization work. Raw JSON is streamed and bounded at 65,536 bytes for send (covers 5000 escaped astral characters), 512 bytes for read, before parsing. Internal multiline spacing remains intact.

## Transaction and sequence

A transaction authenticates with a share lock on its credential, then locks its Conversation row. It rechecks expiry after waiting, resolves a committed idempotency key, applies the shared rate ceiling, inserts USER with the authenticated client author, then updates Conversation. Replays bypass rate counting and make no timestamp/closed-state writes. Same key/different normalized body gives 409; identical body/new key is intentional new content.

The existing Message BEFORE INSERT PostgreSQL trigger allocates sequence while holding the Conversation row lock. No fake client sequence or in-memory coordination is used. Failed insertion/activation rolls back message, sequence and all Conversation changes. First and last timestamps use the persisted message timestamp, taken after the row lock from database clock; clamp to lastMessageAt prevents regression. `firstUserMessageAt` uses COALESCE, `lastMessageAt` is updated for every new USER, and `closedAt` becomes NULL only on a new USER. SYSTEM, poll, read and replay do not activate/reopen/update activity timestamps. Future OPERATOR send must apply its own activity policy in Stage 4.

## Rate index and UTC

Thirty committed USER messages per 60-second window per permanent client/conversation; no additional limiter rows. Serialized count+insert is shared across Node processes. Migration `20260909000000_player_send_rate_index` adds only `(conversationId, authorType, createdAt)` for the equality/equality/time-range COUNT. Existing sequence and idempotency indexes serve history and replay. No old migration is edited and no db push is used.

The installed Prisma PG adapter 7.10.0 replaces a timestamptz offset with UTC during decoding. Therefore application/test connection options explicitly force **session timezone UTC** (`src/server/database-config.ts`), including when a URL supplies another timezone. This changes neither cluster timezone nor historical data. A regression checks real wall-clock proximity. Existing local rows written before this correction can retain historical offset errors; no speculative backfill is attempted. All new messages are stored/returned in UTC, then formatted in the browser's local timezone.

## History, polling, read and scroll

SSR selects latest 100 messages, then reverses into ascending sequence order. No infinite history loading is introduced. A long-lived tab accumulates new messages in memory; a reload returns to latest 100. Future older-history pagination remains possible with sequence cursors.

Controlled timeout polling starts immediately, then waits 5 seconds after a completed cycle. Catch-up fetches up to 10 batches sequentially per turn; if more remains, continue after 250ms. Non-advancing hasMore is an error. At most one poll request is active per lifecycle; requests have a 10-second timeout and AbortController. Hidden tabs pause and abort polling/read; visible/online resumes immediately. Cleanup aborts and ignores late results. Send response **does not advance poll cursor**, preventing skipped interleaved messages. Merge by sequence, ascending, deduplicated, stable React keys; empty/repeated batches preserve the existing array.

Read acknowledgement is debounced 300ms, only while document is visible and history is within 80px of the bottom. It acknowledges the highest sequence delivered by SSR or poll, never an own-send response that could jump over unknown messages. Initial latest-window acknowledgement also marks older prefix read, an explicit MVP policy. The database upsert uses GREATEST, and repeated/backward requests preserve lastReadAt. USER never counts as client unread; only SYSTEM/OPERATOR after marker. Another tab can advance the shared marker. Acknowledgement failures retry on later poll/visibility/scroll. Read is an acknowledgement of delivered text, not proof of human attention.

Initial history scrolls to bottom. New messages auto-scroll when already near bottom; above-history position is preserved with a new-message button. Own successful send scrolls to bottom. ResizeObserver and composer layout keep the bottom anchored during resize/textarea growth without resetting readers above history. Short-height CSS caps textarea at 25dvh (minimum 42px); existing 100dvh/safe-area architecture remains. Physical device keyboard behavior requires device QA.

## Composer and retries

Existing presentation is used by a live client controller; dev preview remains render-only and disabled, with production 404. Non-optimistic sending keeps the draft visible and disabled until the response. Synchronous in-flight guard prevents double submit; Enter sends, Shift+Enter inserts newline, IME composition is protected. Focus returns after completion. No attachments upload is enabled.

A failed logical attempt keeps its normalized text and UUID in component memory. Retry reuses both, including lost-response retries. Editing into different normalized text starts a new attempt; explicit Retry still sends the prior snapshot, which is shown if it differs from the draft. Success clears only the matching draft. No pending fake IDs or timestamps enter canonical history. Unsent/failed drafts do not survive reload or tab close; this is not an offline queue. Polling resumes when connectivity returns. Browser-failure QA uses an isolated DB trigger, never user data or an external messaging service.

## Reproduction and stage boundary

Use README setup, migrate a separate disposable local DB, run lint/typecheck/unit/DB/Prisma/build. DB tests truncate their explicitly opted-in local fixture database; **do not point them at a manual-review DB whose content you want to keep**. After build run both `tests/http/player-smoke.mjs` and `tests/http/messages-smoke.mjs` with TEST_DATABASE_URL and LINA_ALLOW_DB_TESTS=1. They launch/stop two local standalone processes on ports 55440/55442.

No Admin login/send/list, tags, attachments, WebSocket/SSE, message edits/deletes, recovery, presence, production secrets/deploy or application message encryption are implemented. Trusted ingress request/IP limits remain a pre-deployment requirement; the per-client rate ceiling alone does not bound all HTTP/DB load. Stop after Stage 3.
