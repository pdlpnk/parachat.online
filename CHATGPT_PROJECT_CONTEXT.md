# CHAT-ONLY PROJECT — PROJECT MEMORY / PRODUCT + ARCHITECTURE CONTEXT

Этот файл — самостоятельный контекст для нового ChatGPT-чата. Новый ChatGPT не видит репозиторий VX House, предыдущие чаты или другие файлы handoff автоматически. Всё ниже нужно считать исходной памятью продукта, но не доказательством того, что новый сайт уже реализован.

## 1. PROJECT PURPOSE

Нужно создать **новый отдельный сайт**, независимый от VX House. Его основной и почти единственный продукт — максимально простой постоянный чат клиента с персональным менеджером.

Точный клиентский путь:

```text
Landing
→ поле «Ваше имя»
→ кнопка «Начать»
→ backend создаёт Client
→ server присваивает VX ID вида VX000001
→ server назначает постоянный emoji
→ создаётся один permanent conversation
→ создаётся локализованное welcome SYSTEM message
→ сразу открывается Messenger
→ клиент пишет менеджеру
```

Клиенту не нужны email, пароль, полноценная регистрация, подтверждение email, password reset, onboarding или сложный account/profile. Messenger — сам продукт, а не дополнительный раздел кабинета.

## 2. RETURNING CLIENT

При первом создании Client backend генерирует криптографически стойкий случайный opaque credential. Сырой credential не хранится в базе и не должен попадать в JS, URL, логи или аналитику. В БД хранится только его keyed hash, предпочтительно HMAC-SHA-256 с отдельным server-side pepper.

Браузер получает credential через cookie со свойствами:

- `HttpOnly`;
- `Secure` в production;
- `SameSite=Lax`;
- `Path=/`;
- желательно имя с префиксом `__Host-` и без `Domain`.

При повторном посещении:

- валидная cookie → landing пропускается, открывается существующий Messenger;
- отсутствующая, просроченная или отозванная cookie → пользователь считается новым клиентом и видит форму имени.

`VX ID`, имя, UUID conversation и порядковый номер не являются authentication secret. Нельзя восстанавливать доступ только по имени или VX ID.

Ограничение MVP: persistence работает в одном browser profile. После очистки cookie или перехода на другое устройство клиент считается новым. Cross-device recovery отсутствует и является будущим решением.

Logout/reset chat, если появится позже, должен отзывать credential и очищать cookie. Ротация credential должна сначала создать новый credential, безопасно установить новую cookie и затем отозвать старый. Потерянный credential нельзя восстановить из hash.

## 3. ADMIN

Администратор имеет полностью отдельную защищённую авторизацию. Client cookie не даёт доступа к Admin API. Публичной регистрации администраторов нет: первый admin создаётся через безопасный bootstrap/CLI, а не через UI.

Основной Admin интерфейс:

- Messenger;
- список клиентов;
- `Active | Archive`;
- unread counters;
- поиск по имени и VX ID;
- административные tags и фильтрация;
- Client ID и emoji/avatar;
- постоянная история conversation;
- отправка сообщений и attachments;
- опционально internal notes/context, видимые только администраторам.

Типичный путь администратора:

```text
Admin Login
→ Active conversations
→ Active/Archive и tag filter
→ поиск клиента
→ открытие conversation
→ read marker сбрасывает unread именно этого admin
→ ответ / attachment / tag / internal note
→ при необходимости Archive или reopen без удаления истории
```

Каждый Admin endpoint обязан проверять admin session и authorization server-side. Скрытой кнопки в UI недостаточно.

## 4. CLIENT ID

Формат публичного operational identifier:

```text
VX000001
VX000002
VX000003
...
```

Правила:

- уникальный;
- immutable;
- последовательный;
- никогда не переиспользуется;
- генерируется сервером/базой;
- легко копируется администратором;
- не используется как пароль, token или доказательство владения conversation.

Для PostgreSQL рекомендуется sequence и server/DB formatter `VX + six-digit padded number`. Нельзя использовать `COUNT(*) + 1`: параллельные запросы создадут collision. Пропуски sequence после rollback допустимы; идентификатор остаётся never reused.

## 5. EMOJI IDENTITY

Пока настоящих аватаров нет, каждому клиенту один раз назначается постоянный визуально различимый emoji, например:

```text
🦊 Roman
VX000241
```

Emoji:

- присваивается server-side при создании Client;
- сохраняется в БД;
- не меняется после reload, возврата или открытия Admin Messenger;
- помогает быстро различать одинаковые имена;
- не является online status или CRM tag;
- позже может быть заменён настоящим image avatar.

В VX House уже есть безопасный пул примерно из 160 животных, персонажей, растений, космоса, еды и объектов, а также deterministic fallback после исчерпания пула. Пока emoji хватает, разные клиенты должны получать разные значения. Параллельное создание защищается unique constraint/retry или сериализованным server assignment.

Единая avatar architecture:

```text
image avatar
→ иначе stored emoji
→ иначе initials
```

Online/offline dot и tags отображаются независимо от emoji.

## 6. MESSENGER BUSINESS RULES

### Permanent conversation

У каждого Client ровно один Conversation. Он создаётся автоматически и не создаётся пользователем вручную. Нет ticket, topic, priority, category, New Dialog или новых rooms. История не теряется при Archive.

### Message types

- `USER` — настоящее сообщение клиента. Только этот тип может впервые активировать conversation.
- `OPERATOR` — сообщение авторизованного администратора/менеджера.
- `SYSTEM` — server-owned системное событие без пользовательского автора.

Server сам назначает `authorType` и author ID на основании credential. Нельзя доверять значениям из client payload.

### System messages

SYSTEM хранится структурированно, например:

```json
{
  "systemKey": "system.welcome",
  "systemParams": { "name": "Roman" },
  "sourceLocale": "RU"
}
```

UI разрешает известный `systemKey` через словарь RU/EN/TR/AZ и безопасно подставляет scalar params. USER/OPERATOR text автоматически не переводится. Неизвестный key получает нейтральный локализованный fallback, а не raw JSON. Welcome создаётся в той же transaction, что Client и Conversation, поэтому существует ровно один раз.

### Sending and idempotency

Сообщение ограничивается разумным размером, ориентир — 1–5000 символов. Каждый send имеет `Idempotency-Key`; в БД нужна уникальность `(conversationId, idempotencyKey)`. Повтор сетевого запроса возвращает существующее сообщение, а не создаёт дубль. Серверное время является источником `createdAt`; стабильная сортировка — `createdAt, id`.

### Read/unread

Read markers лучше хранить в отдельных таблицах, а не в JSON conversation:

- client unread — новые OPERATOR/SYSTEM messages после client marker;
- admin unread — новые USER messages после marker конкретного admin.

Read не должен менять `Conversation.lastMessageAt` или `updatedAt`, иначе простое открытие чата пересортирует список. Открытие выбранного conversation обновляет только read marker соответствующего principal.

В текущем VX House admin unread считается по USER messages после `adminMessengerReads[adminId]`; при mark-read специально сохраняется прежний `conversation.updatedAt`. В новом проекте этот хороший смысл нужно сохранить, но реализовать typed read tables.

### Timestamps and sorting

В БД timestamps хранятся в UTC. UI отображает их в локальной timezone браузера и выбранной locale. Conversation list сортируется по времени последнего реального сообщения по убыванию. Изменение tags, notes или read marker не поднимает conversation наверх.

### Search

VX House умеет искать по имени, email, VX ID и internal UUID. В новом проекте email отсутствует, поэтому нужен поиск по display name и нормализованному VX ID. Одинаковые имена разрешены; различение идёт по VX ID, emoji и внутреннему UUID.

### Attachments

MVP может разрешать JPEG, PNG, WebP и PDF, до 10 MiB. После выбора пользователь всегда видит preview, имя, размер и возможность удалить файл до отправки. Ошибка upload понятна и не уничтожает введённый текст.

Файлы не должны отдаваться из публичной static directory. В БД хранится metadata и opaque storage key; bytes — в private object storage или persistent private volume. Download endpoint сначала проверяет ownership/admin permission. Проверяются declared MIME, extension, magic bytes, фактический размер и безопасный filename. Ответ использует `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` и безопасный `Content-Disposition`.

Текущий VX House хранит protected attachment bytes в БД и проверяет ownership endpoint-ом. Это полезный security reference, но для нового проекта private object storage предпочтительнее при росте объёма.

### Polling / updates

Фактический VX Messenger не использует WebSocket или SSE:

- Player Messenger опрашивает detail endpoint примерно каждые **5 секунд**;
- Admin Messenger обновляет list и выбранный detail примерно каждые **10 секунд**;
- Admin пропускает polling при `document.hidden`;
- Admin не запускает новый polling cycle, пока предыдущий не завершён;
- search debounce — около **220 ms**.

Для первой версии нового проекта polling предпочтительнее WebSocket: он уже проверен и проще в эксплуатации. Улучшения: AbortController при смене conversation, cursor `createdAt + id`, delta-fetch, замедление background polling и запрет overlapping requests.

### Scroll behavior

При первом открытии нужно перейти к последнему/read message. Новое сообщение автоматически прокручивает вниз только если пользователь уже находится близко к низу, ориентир — 80 px. Если пользователь читает старую историю, показать индикатор новых сообщений и не вырывать позицию. Последнее сообщение всегда должно быть полностью достижимо над composer.

## 7. ACTIVE / ARCHIVE

Ключевое правило:

```text
создание Client
+ создание Conversation
+ welcome SYSTEM message
≠ Active

первое успешно сохранённое USER message
= Active
```

SYSTEM и OPERATOR messages сами по себе не активируют новый chat. Открытие landing, Messenger, polling и read также не считаются пользовательской активностью.

Фактическая текущая логика VX House:

- выбираются verified, не disabled пользователи допустимых клиентских ролей;
- `archived = USER message count === 0 OR conversation.status === CLOSED`;
- Active — обратное;
- SYSTEM onboarding/welcome и OPERATOR reply не активируют;
- список сортируется по последнему сообщению.

Рекомендуемая новая typed-модель:

- Active: `firstUserMessageAt IS NOT NULL AND closedAt IS NULL`;
- Archive: `firstUserMessageAt IS NULL OR closedAt IS NOT NULL`.

В transaction первого USER message сохранить Message, атомарно установить `firstUserMessageAt = COALESCE(firstUserMessageAt, now)` и `lastMessageAt = now`.

Открытый product decision: что делать, если USER пишет в вручную закрытый conversation. Техническая рекомендация — автоматически очистить `closedAt` и вернуть его в Active, чтобы сообщение не потерялось. Решение пока не считать окончательно утверждённым.

## 8. TAGS

Текущая рабочая модель VX House — relational many-to-many:

- создать tag;
- переименовать tag;
- удалить tag, не удаляя Client;
- назначить tag клиенту;
- снять tag;
- несколько tags на одного клиента;
- показывать compact chips рядом с клиентом;
- фильтровать Messenger и Participants;
- комбинировать `Active + tag` и `Archive + tag`.

Tags — только admin CRM metadata. Они никогда не показываются Client и не возвращаются Client API.

Рекомендуемые таблицы: `AdminTag` с unique/normalized name и `ClientTag(clientId, tagId)` с composite primary key. Удаление tag cascade-удаляет только relations. Названия tags — admin content и автоматически не переводятся.

UX: `Active | Archive`, ниже горизонтальная строка `All | HOT | VIP | ...`. На desktop управление открывается popover, на mobile — dialog/bottom sheet. При большом количестве tags показывать первые 2–3 и `+N`. Последний filter можно хранить локально для admin, но удалённый tag должен сбрасывать filter на All.

## 9. RESPONSIVE UX

Messenger-first layout должен одинаково работать на desktop, low-height laptop, tablet и mobile.

Надёжная layout chain:

```css
.shell {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.conversation {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.header,
.composer {
  flex: none;
}

.messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.composer {
  position: sticky;
  bottom: 0;
  z-index: 2;
}
```

Критично:

- каждый grid/flex ancestor scroll area получает `min-height: 0`;
- message pane — единственный scroll owner, а не вся desktop page;
- composer находится sibling к messages и всегда видим;
- использовать `100dvh`, не только `100vh`;
- учитывать `env(safe-area-inset-*)`;
- inputs/textarea на iOS Safari должны иметь минимум `font-size: 16px`, иначе появляется zoom;
- mobile keyboard не перекрывает composer;
- mobile conversation полноэкранный;
- desktop info/tags — popover/drawer, mobile — sheet;
- chat text containers имеют `min-width: 0`, horizontal overflow отсутствует;
- тестировать не только ширину, но и низкие высоты laptop, browser chrome, landscape и zoom.

Обязательные viewport-проверки: 320, 360, 390, 414 и 430 px; portrait/landscape; короткий desktop viewport. Проверить bounding box composer внутри viewport, достижимость scroll bottom, полную видимость последнего сообщения и отсутствие horizontal scroll.

## 10. MINIMAL DATABASE

Новый проект не должен копировать огромную `User` model VX House. Рекомендуемая минимальная схема:

### Client

- internal UUID;
- immutable unique `vxId`;
- `displayName`;
- locale RU/EN/TR/AZ;
- persistent `avatarEmoji`;
- `lastSeenAt`, `createdAt`, `updatedAt`.

### ClientCredential

- UUID;
- `clientId`;
- unique credential hash;
- expiry, lastUsed, revokedAt;
- позволяет ротацию и несколько контролируемых credentials без изменения Client.

### Conversation

- UUID;
- unique `clientId`, гарантирующий один permanent conversation;
- `firstUserMessageAt`;
- `lastMessageAt`;
- `closedAt`;
- timestamps.

### Message

- conversation ID;
- `USER | OPERATOR | SYSTEM`;
- typed client/admin author references;
- обычный body либо `systemKey/systemParams/sourceLocale`;
- idempotency key;
- createdAt;
- unique `(conversationId, idempotencyKey)`.

### Attachment

- conversation/message IDs;
- opaque storage key;
- sanitized display filename;
- media type, bytes, checksum, createdAt.

### Admin

- UUID, unique email, display name;
- password hash;
- disabled flag/timestamps;
- никаких публичных admin signup endpoints.

### AdminSession

- admin ID;
- opaque token hash;
- idle/absolute expiry;
- lastSeen/revoked timestamps.

### AdminTag and ClientTag

- unique normalized tag name;
- many-to-many relation с composite key;
- cascade только для relation rows.

### Read markers

- отдельный client read marker на Conversation;
- отдельный marker `(conversationId, adminId)` для каждого admin;
- reading не меняет ordering fields Conversation.

### InternalNote

- conversation ID;
- admin author;
- text;
- createdAt/updatedAt;
- admin-only. Наличие notes в MVP ещё можно решить, но модель полезна и не должна утекать Client.

Индексы нужны на VX ID, `(conversationId, createdAt, id)`, Active/Archive ordering, credential expiry/hash и обе стороны tag relation. Production использует только migrations; `prisma db push` не применять.

## 11. INFRASTRUCTURE

Новый проект полностью независим от VX House:

- новый repository/project;
- отдельный DigitalOcean deployment;
- отдельная PostgreSQL database и DB user;
- отдельный domain;
- отдельный Nginx site;
- отдельный HTTPS certificate;
- отдельный `.env` и новые secrets;
- отдельное PM2 process name;
- Next.js + TypeScript;
- Prisma + PostgreSQL;
- readiness health endpoint с DB check;
- backup PostgreSQL и attachment blobs.

Рекомендуемая topology:

```text
Internet
→ HTTPS Nginx
→ HTTP 127.0.0.1:3000
→ non-root standalone Node/Next process under PM2
→ private PostgreSQL
→ private attachment storage
```

Node слушает только loopback. Nginx перезаписывает Host и forwarded headers, ограничивает request body и делает HTTP→HTTPS. Proxy headers можно доверять только при отсутствии прямого публичного доступа к Node.

Deployment order: backup → frozen install → Prisma validate/generate → `prisma migrate deploy` → production build → PM2 restart with updated env → PM2 save → Nginx test/reload при необходимости → local/public health → smoke tests.

Нельзя использовать текущую production DB, secrets, домен, environment, uploads или PM2 process VX House. VX House production не должен затрагиваться.

## 12. WHAT WE REUSE FROM VX

Из текущего VX House полезны как COPY/ADAPT/REFERENCE:

- Player Messenger UX;
- Admin Messenger UX;
- message/bubble presentation;
- composer и attachment preview;
- conversation list и search patterns;
- Active/Archive semantics;
- unread/read behavior;
- relational tags и filters;
- protected attachments;
- structured system messages;
- stable VX ID helpers;
- emoji/avatar component с `image → emoji → initials`;
- responsive fixes и mobile master/detail;
- polling 5/10 seconds;
- Origin/rate-limit/authorization patterns;
- relevant Messenger, tags, attachment, VX ID и avatar tests;
- production topology и health lessons как reference.

Код VX использует названия `SupportConversation`, `SupportMessage` и `/api/support`. В новом проекте это нужно адаптировать к нейтральным `Client`, `Conversation`, `Message` и `/api/conversation`, чтобы продукт не ощущался Help Desk.

## 13. WHAT WE DO NOT REUSE

Не переносить:

- Player email/password authentication;
- email verification;
- password reset;
- Resend;
- Pending Email;
- onboarding;
- Player Activated/VIP/Elite status system;
- Tasks;
- Rewards;
- VX Points;
- Trust Score;
- Progress;
- ranks/economy;
- Partner role;
- CMS;
- Keitaro;
- subid/postbacks;
- unrelated analytics;
- ticket categories, priorities и New Dialog;
- большую текущую `User` model;
- старые support/appeals/notifications dependencies;
- production `.env`, credentials, user data, backups, uploads или logs;
- всю legacy-сложность VX House.

Большие VX services приложены в handoff только как reference: прямое копирование принесёт запрещённые зависимости. Новый минимальный application service безопаснее написать по зафиксированным правилам.

## 14. KNOWN VX LESSONS

### 1. Composer исчезает на desktop/коротком экране

**Problem:** `position: sticky` не помогает, если у flex/grid ancestors нет согласованной высоты и `min-height: 0`; outer page становится scroll owner.

**Correct approach:** flex-column conversation фиксированной `100dvh`-derived высоты, header/composer `flex:none`, messages `flex:1; min-height:0; overflow-y:auto`.

### 2. Последнее сообщение нельзя увидеть полностью

**Problem:** history скроллится не в том контейнере или composer перекрывает низ.

**Correct approach:** один internal message scroll container, достаточный bottom padding, вычисляемый bottom и regression check фактических bounding boxes.

### 3. Mobile keyboard закрывает composer

**Problem:** `100vh`, browser chrome, safe-area и keyboard дают неправильную доступную высоту.

**Correct approach:** `100dvh`, safe-area padding, mobile fullscreen conversation, VisualViewport только при необходимости и тестирование на реальном Safari/Android.

### 4. iOS увеличивает страницу при focus

**Problem:** input/textarea меньше 16 px вызывает Safari zoom.

**Correct approach:** минимум 16 px для mobile form controls без уменьшения доступности.

### 5. SYSTEM message ошибочно активирует чат

**Problem:** активность вычисляется по наличию любых сообщений.

**Correct approach:** typed author и отдельный `firstUserMessageAt`; только committed USER message активирует.

### 6. Unread показывает неверное число или пересортировывает список

**Problem:** считаются системные/собственные сообщения либо read записывается в conversation и меняет `updatedAt`.

**Correct approach:** role-aware unread по typed messages и отдельные per-principal read markers; read не трогает ordering timestamps.

### 7. Polling даёт stale state

**Problem:** overlapping requests или response старого выбранного conversation перезаписывает новый state.

**Correct approach:** in-flight guard, AbortController, selected-ID check, merge по message ID и cursor delta.

### 8. Tag popover ломает узкий экран

**Problem:** desktop-positioned popover выходит за viewport и расширяет Messenger.

**Correct approach:** portal/clamped desktop popover; mobile dialog/bottom sheet; horizontal scrolling filters.

### 9. Active indicator/chat item съезжает

**Problem:** badge/tags меняют grid wrapping, а active marker занимает обычное место.

**Correct approach:** marker absolute/pseudo-element, fixed avatar/metadata columns, text `min-width:0`, tags ограничены `+N`.

### 10. Hardcoded локализация остаётся на другом языке

**Problem:** тексты ошибок, mockups и fallback strings обходят единый i18n provider.

**Correct approach:** все видимые system/UI строки — keys RU/EN/TR/AZ; regression scan/test запрещает русские строки при EN/TR/AZ; user/admin content не переводится.

### 11. Attachments не дают feedback

**Problem:** выбор/upload файла проходит без preview или понятной ошибки.

**Correct approach:** локальный preview/name/size/remove до send, explicit error и проверка server storage результата.

### 12. Identity слишком связана с User auth

**Problem:** перенос старых User/session/registration services тащит email, verification, roles и onboarding.

**Correct approach:** отдельные ClientCredential и AdminSession, разные cookies/namespaces, минимальные services и новая DB.

### 13. VX ID используют как identity secret

**Problem:** последовательный публичный ID предсказуем.

**Correct approach:** VX ID только display/search; доступ исключительно через random credential hash + ownership queries.

### 14. Read/write authorization проверяется только UI

**Problem:** подмена conversation/attachment ID может раскрыть чужие данные.

**Correct approach:** ownership condition в каждом repository query; для чужого client resource возвращать нейтральный 404; admin endpoints требуют admin principal.

## 15. MVP

Первую версию держать предельно узкой.

```text
PLAYER: Name → Chat
ADMIN: Login → Messenger
```

Поверх этого обязательны только:

- VX ID;
- постоянный emoji;
- secure same-browser identity;
- permanent conversation;
- welcome SYSTEM message;
- unread/read;
- Active/Archive;
- search;
- tags;
- attachments;
- responsive desktop/mobile;
- health, backup и базовая security.

Не добавлять функции ради заполнения экрана. Если новая идея не помогает начать или продолжить разговор либо работать администратору с conversation, она, вероятно, вне MVP.

## 16. PRODUCT DECISIONS ALREADY MADE

Эти решения уже приняты. Не предлагать пересматривать их без новой явной причины пользователя:

1. Это отдельный проект, а не новая страница VX House.
2. У клиента нет пароля.
3. У клиента нет email.
4. Для начала требуется только имя.
5. Same-browser persistence работает через secure opaque credential в HttpOnly cookie.
6. VX ID обязателен и не является credential.
7. У клиента есть постоянная emoji identity.
8. У клиента один permanent conversation.
9. Welcome — отдельное SYSTEM message.
10. Только первое настоящее USER message делает conversation Active.
11. Admin имеет отдельный защищённый login без публичной регистрации.
12. Polling приемлем и предпочтителен для MVP; WebSocket не обязателен.
13. У проекта отдельные repository, DB, domain и deployment.
14. Messenger — основной продукт, не вторичная функция.
15. Новый проект не должен изменять VX House production.

## 17. OPEN DECISIONS

Решать только тогда, когда это реально потребуется:

- окончательное название и branding;
- новый domain;
- точный welcome copy для RU/EN/TR/AZ;
- private object storage или persistent local volume для attachments;
- retention и data-erasure policy;
- автоматический reopen после сообщения в closed conversation;
- реальный online presence или lastSeen/demo indicator;
- понадобится ли в будущем cross-device recovery и через какой verified factor;
- когда emoji заменяются real generated/image avatars;
- нужны ли internal notes в самом первом MVP;
- нужны ли admin MFA, несколько admin roles или IP restrictions;
- PM2 или Docker Compose как единственный production process model.

Не блокировать scaffold или базовый Messenger вопросами, которые можно безопасно отложить.

## 18. HOW CHATGPT SHOULD WORK WITH ME

Пользователь использует ChatGPT как product architect и reviewer.

Типичный workflow:

```text
Пользователь описывает идею / присылает screenshot / результат Codex
→ ChatGPT оценивает факты и UX
→ объясняет сильные стороны, проблемы и риски
→ вместе выбирается следующее изменение
→ ChatGPT пишет подробный copy-paste prompt для Codex
→ пользователь возвращает результат
→ цикл повторяется
```

Правила для ChatGPT:

- не предполагать, что ChatGPT видит repository;
- использовать только факты из этого context и материалы, которые прислал пользователь;
- не придумывать файлы, модели, endpoints, commit/deploy status или результаты тестов;
- если нужен точный код — попросить конкретный файл/вывод либо написать Codex prompt на исследование;
- сначала отделять диагноз от исправления, особенно для production bugs;
- в Codex prompt задавать scope, запреты, acceptance criteria, tests и final report;
- учитывать mobile/short-height/security/authorization, а не только happy-path UI;
- не смешивать новый проект с VX House;
- не раздувать MVP без запроса пользователя;
- при screenshot review различать наблюдаемый факт и предположение о причине.

## 19. CODEX RELATIONSHIP

У нового проекта будет отдельный Codex-чат. Codex работает непосредственно внутри repository и может читать новый source code, `CHAT_ONLY_SITE_HANDOFF/`, Prisma schema, tests, runtime configuration и git diff.

ChatGPT repository не видит. Поэтому обычное разделение ролей:

- **ChatGPT:** продуктовая архитектура, UX review, анализ предоставленных результатов, точные задания и acceptance criteria.
- **Codex:** исследование фактического repository, реализация, тесты, diff, migration/deploy только после явного разрешения.

Когда данных недостаточно, ChatGPT не угадывает реализацию, а пишет Codex prompt вроде: «Сначала исследуй текущие модели/routes/layout, дай доказанную root cause, затем внеси минимальное изменение…».

Codex также не должен автоматически deploy/migrate только потому, что подготовил код. Production actions должны быть явно включены в конкретное задание.

## 20. CURRENT STARTING POINT

На момент создания этого context новый Chat-only сайт **ещё не создан**.

Существует только подготовленный каталог:

```text
CHAT_ONLY_SITE_HANDOFF/
```

В полном handoff находятся технические документы, manifest, выборочные VX Messenger references, рекомендуемая минимальная Prisma schema и безопасный `.env.example`. Этот файл является продуктовой памятью для ChatGPT, но сам по себе не содержит всего source snapshot.

Будущий Codex должен сначала изучить полный `CHAT_ONLY_SITE_HANDOFF/`, подтвердить границы и только затем создать новый независимый repository/project. Нельзя считать, что routes, DB, UI, domain, infrastructure или deployment уже существуют.

VX House production, его база, migrations, runtime, credentials и пользовательские данные в рамках подготовки handoff не изменялись.

---

## CORE MEMORY IN ONE SENTENCE

Создать отдельный безопасный и адаптивный продукт, где клиент вводит только имя и навсегда в рамках своего браузера попадает в один личный чат, а защищённый Admin Messenger помогает менеджеру работать с Active/Archive, unread, search, tags и attachments — без наследования лишней сложности VX House.
