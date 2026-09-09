# Отчёт: foundation LINA

Дата: 7 сентября 2026. Product: LINA. Repository/project: Chat WEB.

## 1. Initial repository state

Перед изменениями проверены pwd, ls -la, hidden/source inventory, git status, наличие runtime/database tools.
В корне было 84 файла handoff/reference. Не было .git, package.json, lockfile, приложения или собственных миграций.
`git status` возвращал not a git repository. Node/npm не находились в обычном PATH; использован доступный bundled
Node 24.19.0. Инициализирован новый Git repository main, без commit, remote и push.

## 2. Context/handoff

Полностью изучены MASTER_HANDOFF.md, README.md, manifest.json, CHATGPT_PROJECT_CONTEXT.md и все 20 исходных docs:
PRODUCT_SCOPE, MESSENGER_ARCHITECTURE, DATABASE, CLIENT_IDENTITY, ADMIN_AUTH, API, ACTIVE_ARCHIVE, TAGS,
SYSTEM_MESSAGES, ATTACHMENTS, REALTIME, UI_UX, RESPONSIVE_LESSONS, INFRASTRUCTURE, DEPLOYMENT, SECURITY,
TESTING, DEPENDENCIES, SOURCE_MANIFEST, KNOWN_ISSUES_AND_LESSONS.
Изучены 54 source snapshot, обе reference Prisma schema, три SQL snapshot и env example.
Новые решения пользователя имеют приоритет; прежние документы сохранены как исторические.

## 3. Reference reuse

Адаптированы только независимый emoji pool/algorithm и технические принципы: identity sequence, typed SYSTEM,
отдельные read markers, Active/Archive predicate, private attachments и разделение client/admin identity.
UI, database wiring, schema, health, env и LI ID helpers созданы для LINA. Runtime imports из reference отсутствуют.

## 4. Что не переносилось

Старый бренд/цвета/logo/ID, User и UserProfile, email/password player auth, verification/reset/onboarding,
Dashboard, Partner, Tasks/Rewards/Points/Trust/ranks, CMS, analytics/Keitaro, Resend, support categories/priorities,
notifications/appeals, большие legacy services, production config/secrets/data. Docker и лишние frameworks не добавлены.

## 5. Files created

36 новых поддерживаемых файлов (помимо генерируемых/игнорируемых артефактов):

```text
.env.example
.gitignore
.node-version
.npmrc
eslint.config.mjs
next-env.d.ts
next.config.ts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
prisma.config.ts
tsconfig.json
prisma/schema.prisma
prisma/migrations/migration_lock.toml
prisma/migrations/20260907000000_lina_foundation/migration.sql
scripts/prepare-standalone.mjs
src/instrumentation.ts
src/app/layout.tsx
src/app/page.tsx
src/app/globals.css
src/app/api/health/route.ts
src/app/api/health/live/route.ts
src/lib/li-id.ts
src/lib/emoji.ts
src/server/db.ts
src/server/env.ts
src/server/env-schema.ts
src/server/readiness.ts
tests/unit/li-id.test.ts
tests/unit/emoji.test.ts
tests/unit/env.test.ts
tests/unit/readiness.test.ts
tests/database/invariants.test.ts
docs/LINA_FOUNDATION.md
docs/LINA_FOUNDATION_REPORT.md
reference/HANDOFF_README.md
```

## 6. Files modified

Из ранее существовавших файлов изменён только README.md: теперь это стартовая документация LINA.
Его исходная версия сохранена в reference/HANDOFF_README.md. Остальные исходные handoff/reference не изменялись.

## 7. Final structure

src/app — temporary page/tokens/health; src/server — env/db/readiness; src/lib — LI/emoji;
prisma — текущая schema/migration; tests — unit и DB; scripts — упаковка standalone assets;
docs/LINA_* — актуальные решения/отчёт. Reference исключён из сборки/lint.
Generated Prisma Client, .next, node_modules, .local-test и package store игнорируются Git.

## 8. Dependencies

Runtime: Next 16.3.4, React/React DOM 19.2.8, Prisma Client/adapter-pg 7.10.0, pg 8.23.0,
Zod 4.5.4, dotenv 17.4.2, server-only 0.0.1.
Dev: Prisma CLI 7.10.0, TypeScript 5.9.3, ESLint 10.10.0, eslint-config-next 16.3.4,
@eslint/compat 2.1.1, tsx 4.23.13 и соответствующие @types.
Node 24.19.0/pnpm 11.19.0 закреплены. Prisma 8 RC не выбран. Причины каждой зависимости описаны в architecture doc.

## 9. Prisma models

Client, ClientCredential, Conversation, Message, Attachment, Admin, AdminSession, AdminTag, ClientTag,
ClientConversationRead, AdminConversationRead — всего 11. Нет InternalNote и ClientStartAttempt.

## 10. DB constraints/indexes

Unique LI number/string, credential/session hashes, Conversation.clientId, message idempotency/order,
Admin.email и normalized tag name. Composite PK для tags/admin reads. Composite FK для attachment и read
cursor принадлежности диалогу и USER author ownership. CHECK author/content types, positive sequence,
hash format, expiry, metadata limits. Immutable identity/position triggers. Forward-only read markers.
Deferred triggers гарантируют существование ровно одного conversation к commit.
Partial Active/Archive ordering indexes; FK/expiry/reverse tag indexes. Unique constraints уже создают свои индексы.

## 11. Exact LI implementation

Client.liNumber: PostgreSQL GENERATED ALWAYS AS IDENTITY, range 1..999999, NO CYCLE.
Client.liId: stored generated column 'LI' || lpad(liNumber::text, 6, '0').
formatLiId(1) → LI000001; normalizeLiIdSearch принимает LI000241/li000241/241. Zero/invalid/range errors отвергаются.
LI ID никогда не применяется для authentication.

## 12. LI concurrency

Атомарная PostgreSQL sequence; UNIQUE constraints; immutable trigger. Нет COUNT/MAX+1. Rollback допускает gaps,
удаление не сбрасывает sequence. 20 параллельных созданий проверены. Прямые изменения ID отвергаются.
После exhaustion операция должна завершаться ошибкой; диапазон заранее расширяется отдельным решением.

## 13. Emoji

160-item pool, затем детерминированные уникальные комбинации. Mapping опирается на LI numeric component.
Все 999999 значений протестированы на uniqueness и длину ≤32 PostgreSQL characters.
Поле сохраняется в БД и unique. Production assignment service не создан; будущая транзакция сохраняет emoji до commit.

## 14. Read markers

Client marker: PK conversationId. Admin marker: PK conversationId/adminId. Null lastReadSequence означает отсутствие
подтверждений. Composite FK на Message проверяет принадлежность и существование. Trigger не даёт двигаться назад.
Обновления marker не меняют Conversation.updatedAt/lastMessageAt — проверено на БД.

## 15. Message.sequence

Да. BEFORE INSERT trigger атомарно увеличивает Conversation.lastSequence под row lock до конца транзакции.
Гарантируется порядок committed сообщений внутри диалога без timestamp ties/late-commit cursor loss.
Разные conversation не блокируют друг друга. Explicit sequence и изменение позиции запрещены.
Future cursor сравнивает sequence, не предполагает отсутствие gaps.

## 16. SYSTEM representation

SYSTEM: systemKey + JSON object systemParams + sourceLocale, body null, оба author FK null.
USER/OPERATOR: соответствующий author FK и nonempty text; system fields null. CHECK закрепляет комбинации.
Welcome не создаётся сейчас. Dictionary rendering/scalar validation относятся к будущему UI/service.

## 17. Credential foundation

Отдельные ClientCredential/AdminSession, только hashes и expiry/revocation metadata. Нет raw-token columns,
issuance/rotation/login/cookies end-to-end. Server env отделён server-only guard. Pepper резервируется для следующего этапа.

## 18. Creation idempotency design

Предложение без дополнительной таблицы: заранее выдать короткоживущую server-authenticated HttpOnly bootstrap
cookie с random token; Start транзакционно связывает его hash с Client; retry ищет по тому же hash и повторно
выдаёт cookie, используя token из проверенной bootstrap cookie. Public request key не даёт доступа.
Потерянный HTTP response не требует хранения raw token в БД. Multi-tab coordination, expiry/revocation и конфликт
payload требуют отдельных тестов следующего этапа. ClientStartAttempt добавлять только при реальной необходимости
durable replay bookkeeping. Сейчас это только design note.

## 19. Health/readiness

/live → 200 независимо от DB. /health → SELECT 1, 200 или sanitized 503, no-store, bounded timeout.
Реально проверены page/CSS 200; healthy DB 200; stopped DB 503; liveness остаётся 200. Start/login/send API →404.
Production server без DATABASE_URL отвергает запуск. Readiness проверяет connectivity, не полноту migrations.

## 20. Environment

DATABASE_URL обязателен runtime/migrations; без fallback connection. NODE_ENV задаёт Next (validator поддерживает
development/test/production). CLIENT_CREDENTIAL_PEPPER optional/reserved сейчас, 64 hex при наличии; станет обязательным
с issuance layer. TEST_DATABASE_URL/LINA_ALLOW_DB_TESTS используются только opt-in DB tests.
.env.example содержит placeholder URL, не secret. Реального .env не создано. Build работает без DB/env secrets.

## 21. Initial migration status

Initial migration реально применена через migrate deploy к отдельной временной PostgreSQL 18.4,
127.0.0.1:55439/lina_test. Второй deploy: No pending migrations to apply.
PostgreSQL binary скачан только для проверки в .local-test, не добавлен в application dependencies.
DB и HTTP smoke server остановлены. Production migration не выполнялась.

## 22. Реально выполненные команды

Проверки структуры/чтение: pwd; ls -la; git status --short/--branch; git rev-parse --show-toplevel;
rg --files/rg searches; cat/sed/wc/find для handoff/source; git remote -v; git diff --stat;
git diff --no-index --stat reference/HANDOFF_README.md README.md; git ls-files --others --exclude-standard.
Git: git init (первый sandbox-запуск denied, повтор с разрешённым filesystem доступом успешен).
Runtime: command -v node npm pnpm psql postgres initdb; node --version; npm --version; pnpm --version; uname -m.
Первые node/npm без PATH были недоступны. Далее использовался bundled Node в PATH:

```sh
export PATH='/Users/roman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':"$PATH"
pnpm view next version
pnpm view prisma@7 version
pnpm view react version
pnpm view eslint-config-next version
pnpm view typescript version
pnpm view eslint@9 version
pnpm view tsx version
pnpm view zod version
pnpm view @types/node@24 version
pnpm view @types/react version
pnpm view @types/react-dom version
pnpm view pg version
pnpm view @types/pg version
pnpm view eslint version
pnpm view eslint-config-next@16.3.4 peerDependencies --json
pnpm view @eslint/compat version
pnpm view embedded-postgres version
pnpm view @embedded-postgres/darwin-arm64 version
pnpm view @embedded-postgres/darwin-arm64@18.4.0-beta.17 dist.tarball
pnpm view embedded-postgres@18.4.0-beta.17 readme
pnpm install
CI=true pnpm install
CI=true pnpm install --no-frozen-lockfile
CI=true pnpm install --frozen-lockfile
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
pnpm exec prisma validate
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/tsx/dist/cli.mjs --test tests/unit/*.test.ts
node --import tsx --test tests/unit/*.test.ts
pnpm peers check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm db:generate
pnpm build
node scripts/prepare-standalone.mjs
DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test' node node_modules/prisma/build/index.js migrate deploy
TEST_DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test' LINA_ALLOW_DB_TESTS=1 node --import tsx --test tests/database/*.test.ts
DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test' PORT=55440 pnpm start
```

Инфраструктура только для локальных тестов: curl/tar download @embedded-postgres/darwin-arm64@18.4.0-beta.17;
node scripts/hydrate-symlinks.js внутри binary package; postgres --version;
initdb -D .local-test/pgdata -U lina_test --auth=trust --encoding=UTF8 --locale=C;
pg_ctl -D .local-test/pgdata -l .local-test/postgres.log -o '-h 127.0.0.1 -p 55439 -k /private/tmp' -w start;
CREATE DATABASE lina_test через pg; pg_ctl -D .local-test/pgdata -m fast -w stop.
HTTP assertions выполнены через inline Node fetch/assert scripts; missing-env startup проверен через child_process spawn.
Сервер приложения остановлен SIGINT (exit 130 ожидаем для остановленного foreground процесса).

Промежуточные проблемы не скрываются: sandbox блокировал npm DNS/IPC/PostgreSQL shared memory; разрешённые повторы
использованы только для установки/локальных тестов. Первый install встретил pnpm build-script allowlist; исправлен
allowBuilds. ESLint 10 потребовал @eslint/compat и общей обработки Next configs. Исправлена типизация test key;
DB test ожидал другой SQLSTATE при защите identity. Финальные команды ниже прошли после исправлений.

## 23. Lint

pnpm lint: exit 0, без warnings/errors. Правила не отключались ради прохождения проверки.

## 24. Typecheck

pnpm typecheck: exit 0. next typegen + strict tsc --noEmit.

## 25. Tests

Unit: 12 passed, 0 failed, 0 skipped. DB: 10 passed, 0 failed, 0 skipped.
HTTP smoke отдельно проверяет healthy/unhealthy DB, liveness, page/static assets, отсутствующие future API и env startup.
Полноценные Messenger/auth E2E не утверждаются: эти функции не существуют.

## 26. Prisma

prisma validate: valid. prisma generate: успешен, Prisma Client 7.10.0.
Prisma adapter реально прочитал generated LI ID и создал DB-ordered Message в integration test.

## 27. Production build

pnpm build: exit 0 без DB URL. Standalone output + copied static assets.
Routes: /, /_not-found, /api/health, /api/health/live. Никакой публикации.

## 28. Git status

main, No commits yet, no remote. Все 120 учитываемых файлов untracked, включая 84 исходных reference-файла.
Ничего не staged/committed/pushed. Generated dependencies/build/test cluster игнорируются.

## 29. Concise diff summary

36 новых поддерживаемых файлов и один изменённый исходный README. Старый README сохранён отдельно.
Next/TS/config/lockfile; 11-model Prisma schema + SQL invariants; LI/emoji/env/readiness helpers;
5 test files; temporary branded page/tokens; standalone packaging; architecture/report.
Обычный git diff пуст, потому что repository новый и HEAD отсутствует; это не означает отсутствие изменений.

## 30. Намеренно не реализовано

Start/credential issuance/rotation, готовый landing, Messenger/send/polling, unread/search/tags UI/API,
Admin login/auth/Messenger, upload/download, notes, recovery, presence, MFA, roles/IP rules, production infrastructure.
Нет ClientStartAttempt и решения auto-reopen. Старый production не затронут.

## 31. Risks/questions

- Dev-only peer warnings: React/import/jsx-a11y plugins пока декларируют ESLint <=9. @eslint/compat обеспечивает
  фактически проверенную работу с ESLint 10; pnpm peers check всё ещё сообщает metadata mismatch.
- SQL constraints/generated columns/triggers требуют review при будущих migration diffs.
- Reopen, encryption, credential lifetime/bootstrap details, welcome/branding, storage/retention остаются open.
- Text-only messages сейчас требуют body; attachment-only UX нужно согласовать с finalization policy позднее.
- Создание Client обязано включать Conversation в той же транзакции; schema специально отвергает orphan creation.

## 32. Готовность

Да, foundation готов к отдельному следующему этапу Player Identity. Это не готовность всего продукта к production.
Следующий этап не начат автоматически. Production actions не выполнялись. Требуется следующее задание пользователя.
