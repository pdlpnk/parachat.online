# LINA

**Product:** LINA. **Repository/project:** Chat WEB (`chat-web`).

Independent chat-only application. Stage 3 Player Messenger is implemented: name → permanent client/conversation → real text send, polling and read state. Palette and logo are not finalized.

## Development

Use Node 24 (see `.node-version`) and pnpm 11.19.0 (see `package.json`).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Configure a separate local PostgreSQL DB, LINA_ORIGIN and a random CLIENT_CREDENTIAL_PEPPER in .env.
pnpm db:migrate
pnpm dev
```

Example credentials are rejected at runtime. The application binds to loopback by default.
No production infrastructure is included.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm db:generate
pnpm build
```

Generation, validation and build work without a database. Server startup validates runtime environment.
Migrations require DATABASE_URL. Use **prisma migrate deploy**, never db push as a migration substitute.

Database tests require a migrated, disposable **local** database named `lina_test` or `lina_test_*`:

```sh
DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test_stage3' pnpm db:migrate
TEST_DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test_stage3' LINA_ALLOW_DB_TESTS=1 pnpm test:db
```

This URL describes the isolated test setup used during development, not a production credential.
Tests reject remote/incorrectly named databases and truncate fixture tables only with explicit opt-in.

## Endpoints

- `/` — SSR name form or live Player Messenger (latest 100 messages).
- `POST /api/player/bootstrap` — short-lived HttpOnly start preparation and invalid-cookie cleanup.
- `POST /api/player/start` — atomic, idempotent player creation; exact Origin required.
- `POST /api/player/messages` — authenticated USER send with UUID v4 Idempotency-Key header.
- `GET /api/player/messages?after=0` — incremental 100-message batches.
- `POST /api/player/read` — monotonic player acknowledgement.
- `GET /api/health/live` — process liveness, independent of database availability.
- `GET /api/health` — bounded SELECT 1; 200 when DB is reachable, otherwise sanitized 503.

Readiness tests connectivity, not whether every migration has been applied. Health responses use no-store.

## Source map

```text
src/app/                 Player page, identity and health routes
src/server/              Runtime env, Prisma, readiness, identity protocol
src/lib/                 LI ID and persistent emoji helpers
src/generated/prisma/    Generated client; ignored in Git
src/instrumentation.ts   Runtime startup validation
scripts/                 Standalone browser asset packaging
prisma/                  Current schema and additive PostgreSQL migrations
tests/unit/             Helpers, crypto, env and readiness tests
tests/database/         PostgreSQL invariants, player and concurrency tests
docs/LINA_FOUNDATION.md  Current architecture and next-stage boundaries
reference/               Historical source snapshots; never runtime dependencies
```

## Current authority and historical material

[Player Messenger contract](docs/LINA_PLAYER_MESSENGER.md) describes current Stage 3 behavior.
[Stage 3 report](docs/LINA_PLAYER_MESSENGER_REPORT.md) records verification and limits.
[Player Identity architecture](docs/LINA_PLAYER_IDENTITY.md) is the current identity contract.
[LINA foundation architecture](docs/LINA_FOUNDATION.md) describes preserved Stage 1 invariants.
The existing MASTER_HANDOFF.md, CHATGPT_PROJECT_CONTEXT.md, manifest.json, the other original docs,
and reference/ are **historical reference**, not the current application contract.
The original README is preserved in reference/HANDOFF_README.md; its links originally targeted the project root.

Historical names, identifiers, account flows, colors and infrastructure do not apply to LINA.
Reference source is excluded from TypeScript, lint and application imports.

## Not implemented

No Admin login/Messenger, tags API/UI, file upload/download, notes, presence, recovery, rotation or deployment.
Application-level message encryption and older-history pagination remain open.

## Player identity verification

The supported start UI requires JavaScript and Web Locks (modern browser, HTTPS or localhost). Credential lifetime is
365 days; lost-response retry is possible during the original 15-minute bootstrap window. The DB enforces a shared
120-new-credentials/minute ceiling; trusted per-IP ingress limits are required before deployment.

After `pnpm build`, run the production HTTP smoke against the disposable DB (ports 55440 and 55442 must be free):

```sh
TEST_DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test_stage3' LINA_ALLOW_DB_TESTS=1 node tests/http/player-smoke.mjs
```

Full Stage 2 results: [Player Identity report](docs/LINA_PLAYER_IDENTITY_REPORT.md).

## Stage 2.5 — Messenger UI

The current presentation includes a manager-focused header, three bubble styles, a live player composer and matching
name landing. Stage 3 activates sending/polling/read; Admin functionality is not implemented. `/dev/messenger` shows render-only design
fixtures in development and returns 404 in production. See [UI/UX report](docs/LINA_MESSENGER_UI_REPORT.md).

## Stage 3 verification

After build, run `tests/http/messages-smoke.mjs` with the same disposable DB environment as the identity smoke.
The runtime forces PostgreSQL connection sessions to UTC; it does not modify the cluster timezone.
Unsent drafts/retry keys live only in the current tab and do not survive reload.
