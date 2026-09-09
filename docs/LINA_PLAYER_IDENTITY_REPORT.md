# Stage 2 — Player Identity: отчёт

7 сентября 2026. Product: LINA. Repository: Chat WEB.

## 1. Initial state

Существующий Next.js/React/strict TS/Prisma/PostgreSQL foundation, placeholder `/`, health endpoints,
11 моделей, initial migration с SQL constraints/triggers, 12 unit и 10 DB tests. Git main без commits/remote;
120 untracked файлов, включая исторические handoff/reference. Приложение не пересоздавалось.

## 2. Files reviewed

README, docs/LINA_FOUNDATION.md, docs/LINA_FOUNDATION_REPORT.md, package/config files, Prisma schema и
initial migration, src/app page/layout/styles/health, instrumentation, env/schema/db/readiness,
LI/emoji helpers, все существующие unit/database tests. Фактические constraints, sequence и read markers
сверены с отчётом; проверены git status, routes и runtime environment. Applicable AGENTS.md не найден.

## 3. Files created

13 поддерживаемых файлов:

- src/lib/player.ts
- src/server/identity/crypto.ts
- src/server/identity/service.ts
- src/server/identity/http.ts
- src/components/name-form.tsx
- src/app/api/player/bootstrap/route.ts
- src/app/api/player/start/route.ts
- prisma/migrations/20260907010000_player_start_rate_index/migration.sql
- tests/unit/player.test.ts
- tests/database/player.test.ts
- tests/http/player-smoke.mjs
- docs/LINA_PLAYER_IDENTITY.md
- docs/LINA_PLAYER_IDENTITY_REPORT.md

## 4. Files modified

.env.example, README.md, docs/LINA_FOUNDATION.md, package.json, prisma/schema.prisma,
src/server/env-schema.ts, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, tests/unit/env.test.ts.
Dependency versions/lockfile не менялись; test:db запускает файлы последовательно из-за Stage 1 fixture cleanup.
Foundation doc получил ссылку на актуальный identity contract. Исторический Stage 1 report сохранён.

## 5. Database changes

Только индекс ClientCredential.createdAt для проверки общего лимита создания identity. Все 11 моделей,
LI/generated columns, one-conversation invariants, sequence/read triggers и Active/Archive semantics сохранены.

## 6. Migration details

20260907010000_player_start_rate_index: CREATE INDEX ClientCredential_createdAt_idx.
Применена через migrate deploy на disposable PostgreSQL 18.4: 127.0.0.1:55439/lina_test.
Никакого db push. Initial migration побайтно совпадает с копией перед Stage 2. Обычный CREATE INDEX
может кратко блокировать writes; для будущей большой live DB deployment strategy требует review.

## 7. Exact Player flow

GET `/` → server resolves cookie → anonymous name form или сразу existing Messenger, без landing flash.
Форма автоматически готовит short-lived cookie через POST bootstrap. Submit под Web Lock повторно проверяет
подготовку, затем POST start → подтверждённый commit/Set-Cookie → navigation `/` → SSR Messenger.
При ошибке текст имени сохраняется. Поля только имя; успех не показывается до ответа backend.

## 8. Exact creation transaction

Read Committed transaction: keyed-hash advisory lock → повторная проверка bootstrap expiry → поиск existing hash.
Для нового: global creation lock/ceiling → Client с DB-issued LI → сохранение permanent emoji → Conversation →
structured SYSTEM welcome → ClientCredential hash/expiry → commit. Temporary random emoji виден только внутри
транзакции. Ошибка откатывает все строки; gaps в PostgreSQL LI sequence допустимы.

## 9. Credential generation

32 CSPRNG bytes из node:crypto.randomBytes, base64url token длиной 43 символа. Генерируются при подготовке
bootstrap и до commit находятся в authenticated encrypted cookie. Raw token никогда не хранится в БД.

## 10. Credential hashing

HMAC-SHA256 с CLIENT_CREDENTIAL_PEPPER, декодированным из 64 hex в 32 bytes; DB хранит только 64 hex digest.
Pepper обязателен runtime, общий для всех instances, не NEXT_PUBLIC. Plain SHA-256 не используется.
GCM проверяет authentication tag в crypto library; ручного сравнения bearer tokens нет, DB lookup по keyed hash.

## 11. Cookie name/flags

Production: __Host-lina_client и __Host-lina_bootstrap. HttpOnly, Secure, SameSite=Lax, Path=/, без Domain.
Local development/test: lina_client/lina_bootstrap, Secure=false. Production localhost HTTP smoke проверяет
реальные production flags; браузер разрешил secure localhost cookies. Raw token выдаётся только Set-Cookie.

## 12. Credential lifetime

365 дней от создания, абсолютный expiresAt. Подходит для same-browser identity без коротких повторных входов.
Retry сохраняет исходный expiry. Sliding extension/rotation отсутствуют. При утрате cookie recovery нет.

## 13. Session resolution

Единый resolvePlayer: canonical token format → HMAC lookup в ClientCredential → revoked/expiry check →
explicit safe client DTO. Никаких lastUsedAt/lastSeenAt writes на render. Cookie, имя и LI имеют разные роли.

## 14. Invalid/expired/revoked behavior

Anonymous landing без создания Client. Landing bootstrap POST очищает invalid client cookie; при JS disabled
cleanup не выполняется, но GET всё равно anonymous. Revoked/expired committed bootstrap заменяется новой
попыткой при подготовке; старый raw token остаётся недействителен. Прямой replay старой попытки получает 409.
DB outage показывает нейтральную недоступность, без SQL/stack traces и автоматической новой identity.

## 15. Start idempotency

Opaque AES-256-GCM bootstrap: IV 12 bytes + ciphertext 40 bytes + tag 16 bytes; 91 base64url characters.
Authenticated payload — issuedAt + будущий random token, purpose/version AAD; отдельный derived encryption key.
Срок 15 минут без продления. Bootstrap не принимается как client token. Durable binding — unique credentialHash.
После commit тот же bootstrap воспроизводит тот же raw token для повторной cookie installation.

## 16. ClientStartAttempt table

Нет. Existing unique credentialHash + encrypted client-held bootstrap дают durable binding/replay без raw token
в БД и без дополнительного workflow. Новая таблица не нужна для выбранного ограниченного retry window.

## 17. Parallel Start

PostgreSQL transaction advisory lock по 64 bits keyed hash; full unique hash остаётся authoritative.
Lock общий между processes; collision лишь сериализует независимые попытки. 16 parallel service requests
через независимые pools и 12 HTTP requests к двум реальным Node processes проверены.
Web Lock дополнительно сериализует первую cookie preparation/Start между вкладками. UI требует современный
браузер с Web Locks/JavaScript; небезопасного fallback для конкурирующих первых cookies нет.

## 18. Lost response

HTTP smoke отбрасывает ответы Set-Cookie и повторяет Start с исходным bootstrap: та же credential/Client,
одна Conversation/welcome. Восстановление ограничено исходными 15 минутами. После expiry bootstrap без
установленной client cookie — новый visitor. Потеря обеих cookies также не восстанавливается. Это явная
граница MVP, а не обещание бессрочной идемпотентности после утраты всех bearer secrets.

## 19. Welcome SYSTEM

system.welcome, params {name}, sourceLocale RU; authorType SYSTEM, body и оба author FK null.
Existing trigger выдаёт sequence=1. Unique player-start:welcome:v1 в одной Conversation и transaction replay
не допускают повторного welcome. Resolver выводит RU text, неизвестные/невалидные параметры — neutral fallback.
React escaping, без dangerouslySetInnerHTML; HTML-подобное имя проверено HTTP smoke.

## 20. LI ID

Существующий PostgreSQL identity/generated LI ID. Backend не использует COUNT/MAX и не принимает caller ID.
Public LI нельзя использовать для session/search recovery; query-параметр и cookie с LI дают anonymous.

## 21. Emoji

Существующий emojiForLiNumber, вычисление только при создании по DB number; результат сохранён в Client.
Render читает stored value. Parallel different bootstraps дают разные LI/emoji. Старый exhaustive тест всего
диапазона 999999 продолжает проходить.

## 22. Messenger shell

LINA, emoji, displayName, LI ID; actual stored welcome; footer сообщает, что отправка появится позже.
Нет send action/fake USER messages. 100dvh, min-height:0, internal overflow, safe-area padding, input 16px,
mobile widths и desktop. Заголовок ограничен двумя строками; полное имя остаётся в доступном тексте/welcome.

## 23. Origin/CSRF

Оба POST требуют exact configured LINA_ORIGIN; missing/null/foreign Origin и cross-site metadata отвергаются.
Нет trust по Host/X-Forwarded-Host. SameSite=Lax, no-store. Start принимает JSON со stream limit 2048 bytes.
LI/emoji/author поля клиента игнорируются; все authoritative значения назначаются backend.

## 24. Rate-limit/abuse

PostgreSQL shared ceiling: 120 новых credential rows за минуту под общей transaction lock; 429/Retry-After:60.
Committed retries проходят даже при достигнутом лимите. Никаких in-memory distributed claims/Redis.
Это coarse global protection: перед public exposure нужны trusted ingress per-IP limits, connection/body-read
limits. Глобальный лимит может временно блокировать честных новых посетителей при атаке/пике нагрузки.

## 25. Security review

Нет raw token в DB, JSON, HTML, URLs, JS/storage/logs. Нет hashes/pepper/admin data в payload.
Поиск в .next/static не нашёл credentialHash, CLIENT_CREDENTIAL_PEPPER, issueBootstrap или node:crypto.
Runtime source не содержит console logging, browser storage или raw HTML injection. Env доступен через
server-only boundary; crypto использует Node backend. GCM tampering/wrong-key/expiry и revocation проверены.
Stolen live bootstrap является short-lived bearer secret: защищается теми же cookie flags.

## 26. Client-exposed data

DTO whitelist: displayName, liId, avatarEmoji, locale, messages[{sequence,text}]. UUID, tags, admin,
credential metadata и raw structured params не передаются. Start JSON только {ok:true}; bootstrap —
{authenticated:boolean}; errors содержат только нейтральный UX текст.

## 27. Tests added

3 unit tests: Unicode validation; encrypted bootstrap/entropy/hash/expiry/tampering; SYSTEM resolver.
8 DB tests: atomic identity/DTO, concurrency/retry/lost-response, duplicate names, anonymous inputs,
revoked/expired, admin separation, late transaction rollback, shared rate ceiling + retry bypass.
Production HTTP harness: real two-process flow, flags, escaping/secrecy, Origin, cookie cleanup/replay,
query LI rejection, DB invariants, health и отсутствие будущих endpoints. Env tests обновлены.

## 28. Actual test results

Unit: 15 passed, 0 failed/skipped. Frozen install exit 0; dependency/lockfile versions сохранены.
Последовательные quality gates выполнены реально; после исправлений повторены затронутые проверки.

## 29. Database test results

18 passed, 0 failed/skipped (10 Stage 1 + 8 Stage 2), только guarded local lina_test.
Включён намеренный late welcome-trigger failure: Client/Conversation/credential не остаются после rollback.
Rate-limit fixtures очищаются в finally. Stage 1 test suite очищает disposable fixtures, не production data.

## 30. Lint

pnpm lint и финальный прямой ESLint: exit 0, без warnings/errors.
Существующий ESLint compatibility adapter сохранён; известные upstream dev peer metadata warnings — из Stage 1.

## 31. Typecheck

pnpm typecheck: next typegen + strict tsc --noEmit, exit 0. Финальные builds также прошли TypeScript check.

## 32. Prisma validate/generate

pnpm db:validate и db:generate: exit 0; Prisma Client 7.10.0 успешно сгенерирован.

## 33. migrate deploy

Additive index migration применена успешно к isolated local DB. Initial migration не менялась.
Повторный deploy проверяет отсутствие pending migrations. Ни одного remote connection/db push.

## 34. Production build

pnpm build: exit 0, standalone + static assets, без DB URL/secrets при сборке. После последнего CSS изменения
next build + standalone asset packaging повторены успешно. Routes: /, /_not-found, health/live, health,
player/bootstrap, player/start. Production deploy не выполнялся.

## 35. HTTP/browser smoke

Production HTTP smoke прошёл после финальной сборки: anonymous, Start, cookie flags, SSR returning client,
two-process concurrency, discarded-response retry, revoked bootstrap cleanup, DB checks, readiness/liveness.
Browser automation через Codex in-app browser: name validation error; Start; две вкладки → один LI000169;
reload без формы; final-version long-name flow → тот же LI000221 после reload.
Пять ширин 320/360/390/414/430: DOM scrollWidth=innerWidth, input font=16px; Messenger height=640 при viewport=640.
Low-height 320×240: shell=240, внутренний scroll container остаётся ограниченным, длинный welcome переполняет
его, а не страницу. Desktop screenshot проверен. Browser viewport override нестабилен при native snapshots:
программная проверка прокрутки клавишами не подтвердила scrollTop; успешный physical-device scroll/keyboard
не заявляется. Реальные iOS/Android keyboard/safe-area и достижимость конца при touch scroll требуют device QA.

## 36. Git status

main, No commits yet, no remote. 133 untracked поддерживаемых файла после отчёта, включая исторические 84.
Ничего не staged/committed/pushed. node_modules/.next/generated Prisma/.local-test игнорируются.

## 37. Concise diff summary

13 новых файлов, 10 существующих изменены. Identity crypto/service/routes, RU form и SSR shell,
минимальный rate index, unit/DB/HTTP tests и текущая документация. Нет dependency churn или foundation rewrite.
Обычный git diff пуст из-за отсутствия HEAD; это не означает отсутствие работы.

## 38. Намеренно НЕ реализовано

USER send, polling, unread/read API/UI, activation первым USER, attachments, Admin login/Messenger,
tags/search, recovery, rotation/logout/reset, WebSocket/SSE, production инфраструктура.
firstUserMessageAt остаётся null. Stage 3 не начат.

## 39. Risks/open questions

15-minute replay window; no recovery after cookie loss; Web Locks/JS prerequisite; trusted ingress per-IP
protection перед deploy; общий pepper должен сохраняться между рестартами/instances; смена pepper инвалидирует
все sessions. Physical mobile keyboard/touch-scroll QA остаётся. Automatic reopen, final copy/branding,
message encryption и future retention остаются за пределами этапа. Нет утверждения о готовности к production.

## 40. Ready for Stage 3

Да, серверный Player Identity flow и permanent Conversation готовы как база для отдельного Stage 3:
USER send → polling → read/unread → first USER activation. Перечисленная device QA остаётся отдельной проверкой
перед production. Stage 3 не реализован автоматически; production не затронут.

## Команды воспроизведения

Использован Node 24.19.0 из bundled runtime и pnpm 11.19.0, как в Stage 1:

```sh
export PATH='/Users/roman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':"$PATH"
CI=true pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm db:generate
DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test' pnpm db:migrate
TEST_DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test' LINA_ALLOW_DB_TESTS=1 pnpm test:db
pnpm build
TEST_DATABASE_URL='postgresql://lina_test@127.0.0.1:55439/lina_test' LINA_ALLOW_DB_TESTS=1 node tests/http/player-smoke.mjs
```

Локальная PostgreSQL запускалась/останавливалась через имеющийся .local-test pg_ctl; HTTP harness завершает
свои два процесса в finally. Browser servers использовали случайный тестовый pepper только в памяти.
Никакого реального .env/production secret не создавалось. Sandbox escalation использован только для локальных
process/network checks и frozen install; запретов auto-review на итоговые действия не было.
