# LINA foundation — Stage 1 architecture

Stage 2 identity is now implemented; [the Player Identity contract](LINA_PLAYER_IDENTITY.md) supersedes
the future identity/placeholder statements below. Stage 1 DB invariants remain unchanged.

Product: **LINA**. Repository/project: **Chat WEB**. This document supersedes historical branding,
identifiers and legacy architecture in the original handoff, read in full before implementation.

## Scope and dependencies

One Next.js App Router application, strict TypeScript, Prisma 7 and PostgreSQL. No Docker, Redis,
queues, microservices, realtime infrastructure or player auth framework. Node and packages are pinned.
Next/React provide the app; Prisma/adapter-pg/pg connect to PostgreSQL; Zod validates env; dotenv loads
local CLI configuration; server-only guards runtime secret access. TypeScript, ESLint/Next rules and
node:test with tsx are development tooling. @eslint/compat bridges the React plugin shipped in Next's
config to ESLint 10. Three upstream plugins still declare ESLint <=9 peer ranges; pnpm peers check reports those
metadata warnings. Actual lint runs pass through the official compatibility adapter. Track upstream ESLint 10 support
and remove the adapter when those plugins support it directly. The app uses independent neutral CSS tokens, no logo or finalized palette.
The placeholder is English; future product locales are RU/EN/TR/AZ.

## Schema

Eleven models: Client, ClientCredential, Conversation, Message, Attachment, Admin, AdminSession,
AdminTag, ClientTag, ClientConversationRead, AdminConversationRead. No User, InternalNote or ClientStartAttempt.
Timestamps are timestamptz(3). Client has no email/password/role/profile lifecycle.

Important constraints also live in the initial SQL migration. Generated columns, CHECK constraints,
deferred triggers and partial indexes must be preserved in future migrations. Do not replace the migration
with an unreviewed generated diff or use db push.

### LI identity

Client.liNumber is GENERATED ALWAYS AS IDENTITY, backed by a PostgreSQL sequence, range 1..999999,
increment 1, NO CYCLE. Client.liId is a stored generated column: LI plus six padded digits.
Both are unique. A trigger prevents changing numeric identity/UUID; PostgreSQL rejects writes to the generated
string. No COUNT/MAX allocation. Rollbacks may consume numbers; deletion does not reset the sequence.
Numbers reflect allocation order, not HTTP completion order. Exhaustion raises an error; never reset/wrap.
Backup recovery must preserve the allocation high-water mark, including IDs issued after an older backup.

formatLiId validates integer/range. normalizeLiIdSearch accepts full/lowercase/numeric forms and rejects
zero/malformed/out-of-range values. LI ID is public display/search data, never authentication authority.

### Emoji

The independent helper adapts the 160-item reference pool and deterministic combination algorithm.
First 160 numbers use single emoji; larger numbers have distinct combinations. Tests cover all 999999
numbers, uniqueness and varchar(32) character capacity. Preserve pool order. Assign server-side from the
DB-issued number and persist before commit; never recompute stored emoji when the helper changes.
Unique numbers plus injective mapping prevent races; avatarEmoji UNIQUE is a second guard.

The next creation transaction can reserve the numeric component from the DB sequence and use a reviewed
server-only insert, or fill the final emoji after initial insertion within the same transaction. Never
publish a temporary value. No allocation service or avatar upload exists now.
Future rendering: image → stored emoji → initials.

### Exactly one conversation

Conversation.clientId UNIQUE provides at most one. A deferred constraint trigger on Client insertion
requires a conversation by transaction commit. Another deferred trigger rejects deleting its conversation
while the Client remains. Conversation identity/ownership are immutable. Client creation must be transactional.
No GET creates/repairs data. Restrict history deletion; cascades only affect credential/session and tag/read
children. Deleting a tag cannot delete Client. Erasure is a future explicit DB/blob operation.

### Message order and representation

Message.sequence is assigned by a BEFORE INSERT trigger. Atomic UPDATE increments Conversation.lastSequence
and holds that row lock through transaction completion. Writes to one conversation serialize; other
conversations are independent. Rollback rolls back the counter. There is no MAX()+1. Caller-supplied
sequence and updates to message position are rejected. Unique (conversationId, sequence) backs polling/read
cursors. UUID remains resource identity and createdAt remains display time.

Unique (conversationId, idempotencyKey) prevents duplicates. Future replay handling must compare author and
payload, return the original result for an identical retry, reject conflicts with 409 and return exact messageId
for attaching a file. INSERT ON CONFLICT can leave a counter gap; cursor logic must not assume contiguity.

USER requires client author; OPERATOR requires admin author; SYSTEM requires neither. A composite FK ensures
USER author owns the conversation. These are integrity checks, not authentication: future endpoints must
still authorize principals and set authorType themselves. SYSTEM requires key, object params, source locale
and null body. USER/OPERATOR currently require nonempty text and null system fields. Attachment-only null
body requires a later policy/migration alongside validated finalization, not empty visible placeholders.
No welcome/send service exists. Dictionary whitelist/scalar-param validation belong to the next stage.
Text currently uses a body column; application-level encryption remains OPEN.

### Active / Archive

Active: firstUserMessageAt IS NOT NULL AND closedAt IS NULL.
Archive: firstUserMessageAt IS NULL OR closedAt IS NOT NULL.

The ordering trigger changes ONLY lastSequence. It does not activate, update lastMessageAt/updatedAt,
or choose a reopen policy. Future USER send sets firstUserMessageAt with COALESCE and updates lastMessageAt.
Automatic reopen remains OPEN. Separate partial indexes order each scope by lastMessageAt DESC NULLS LAST/id,
with filtering before pagination.

### Read markers

Client: one per conversation. Admin: one per conversation/admin. Null lastReadSequence means no acknowledgment.
Composite FK requires an existing message in the same conversation. A trigger prevents backwards updates;
future upserts should take the greatest current/requested acknowledged sequence. Only marker rows change.
Admin unread counts later USER messages; client unread counts later OPERATOR/SYSTEM messages.
The future endpoint must acknowledge only actually delivered/viewed messages.

### Attachments, tags, admin

Attachment is metadata only. Composite message/conversation FK, unique opaque storageKey, checksum, filename,
MIME, byteSize, timestamp. Limits: JPEG/PNG/WebP/PDF, 1..10 MiB. Magic-byte/filename/storage-key validation,
private storage, authorized download and orphan cleanup are future work. Never use public/static storage.

Admin email is normalized lower-case/trimmed and unique. AdminTag.normalizedName is unique and constrained
to lowercased/collapsed name. ClientTag has composite PK and reverse index. Tags must never enter client DTOs.
No admin auth or tags routes exist.

## Credential foundation and next-stage start idempotency

ClientCredential and AdminSession are independent. Only 64-character lowercase hash columns exist; no raw
token storage. No issue/rotate/revoke flow. Future credentials need 32 random bytes, HMAC, Secure/HttpOnly/
SameSite/__Host- cookies, Origin checks, ownership and rate limits. CLIENT_CREDENTIAL_PEPPER is reserved,
optional now and validated if supplied; make it required when issuance exists. Introduce a separate admin
pepper and password hashing/CLI bootstrap with Admin auth.

DB commit and cookie delivery are not atomic. A public idempotency key must never recover a session.
Minimal proposal for the NEXT task, without automatically adding ClientStartAttempt:

1. Automatically prepare a short-lived, server-authenticated HttpOnly bootstrap cookie before Start,
   containing a server-random token and authenticated purpose/expiry. No extra form step, no Client yet.
2. Start verifies bootstrap and transactionally creates Client/Conversation/welcome/ClientCredential.
3. Unique token hash binds retries to the same Client. Reuse the random token from the verified bootstrap
   cookie when setting the final credential cookie. Raw token never needs storage in DB.
4. A lost response can retry with bootstrap; an existing valid client cookie returns its own conversation.
   Never reactivate expired/revoked credentials or restore access using LI ID/name.

This is a DESIGN NOTE, not implemented or a finalized auth protocol. Next tests must cover lost response,
concurrent start, conflicting inputs, expiry and multi-tab initialization. Share/coordinate bootstrap
between tabs. Add an attempt table only if durable replay/payload bookkeeping proves necessary.

## Runtime/health

Node server startup validates env; errors contain field names only. DATABASE_URL is required at runtime,
PostgreSQL only, example placeholders rejected. Secrets are accessed through server-only modules.
No NEXT_PUBLIC secret. Builds/generation do not need a DB; migrations require an explicit URL with no fallback.

GET /api/health/live: 200 if the process is running. GET /api/health: SELECT 1, sanitized 200/503.
Response deadline 3 seconds, with driver connect/query deadlines too. no-store. Connectivity is not schema readiness.

## Next stage / open decisions

Next: Player Identity / Name → Client → Conversation → secure same-browser session. Resolve bootstrap details,
credential lifetime and encryption before that layer. Later: Messenger, Admin, unread/search, tags and attachments.
Responsive/security checks accompany each stage. Reopen, final branding/welcome, storage, retention and production
infrastructure remain open. No deployment, remote DB use, commit or push in this task.
