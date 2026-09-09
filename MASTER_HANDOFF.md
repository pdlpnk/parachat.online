# MASTER HANDOFF: отдельный VX House Chat-Only

## 1. Результат, который нужно построить

Новый сайт — минимальный приватный канал общения. Гость видит лендинг с единственным обязательным полем «Ваше имя». После `Begin` сервер в одной транзакции создаёт клиента, последовательный публичный `VX ID`, постоянный диалог и локализованное приветственное SYSTEM-сообщение. Сервер выдаёт непрозрачный bearer-token в защищённой HttpOnly cookie; браузер сразу открывает Messenger.

Возврат с того же браузера восстанавливает тот же диалог по cookie. Отдельной клиентской авторизации, email, пароля и профиля нет. Администратор входит через отдельный admin-only auth flow и работает с клиентами через Active/Archive, поиск, теги, unread, заметки и вложения.

### Exact player flow

1. Если валидной client cookie нет — показать landing с единственным обязательным полем «Ваше имя» и кнопкой «Начать».
2. `POST /api/client/start` server-side генерирует Client, immutable `VX000001…`, opaque credential, permanent Conversation и один welcome SYSTEM message.
3. Raw credential устанавливается только в secure HttpOnly cookie; browser получает безопасный client/conversation view и сразу открывает Messenger.
4. Пользователь отправляет USER message в этот же conversation. Только успешный commit первого USER message делает его Active у admin.
5. При следующем посещении валидная cookie пропускает landing и открывает ту же историю.
6. При отсутствии/утере cookie пользователь считается новым; имя/VX ID не восстанавливают доступ.

### Что не строим

Не переносим клиентские email/password/login, verification/reset, onboarding, Resend, profile/account, Partner, CMS, Tasks, Rewards, VX Points, Trust Score, Progress, ranks, Keitaro/analytics, tickets/categories/priorities и создание новых диалогов.

## 2. Главные инварианты

1. Один `Client` имеет ровно один `Conversation`.
2. `VX ID` — отображаемый идентификатор, не credential.
3. Сырой client token никогда не хранится в БД или логах; хранится только keyed hash.
4. Разговор становится Active только после первого сохранённого сообщения `authorType=USER`.
5. Переход на Messenger и SYSTEM-сообщения не активируют разговор.
6. PLAYER/Client API никогда не возвращает admin tags, notes и внутренние признаки.
7. SYSTEM хранится как `systemKey + params + sourceLocale`; UI локализует при чтении.
8. Вложения скачиваются только через авторизованный endpoint; storage key не публичный URL.
9. Список диалогов сортируется по последней реальной активности, read marker не меняет `updatedAt` разговора.
10. Все мутации защищены Origin-проверкой и rate limit.

## 3. Порядок реализации

### Exact admin flow

Admin открывает отдельный login → server создаёт admin-only session → после входа открывается список Active (по умолчанию) → переключает Active/Archive и tag filter без reload → ищет по имени/VX ID → открывает один conversation → read marker сбрасывает только его unread → отвечает/прикладывает файл → при необходимости добавляет tags и internal notes → archive/reopen не удаляет историю. На mobile список и диалог показываются последовательно; back возвращает к сохранённому фильтру/поиску.

### Этап A — каркас

- Создать новый репозиторий и отдельную PostgreSQL database/user.
- Зафиксировать Node/pnpm версии и минимальные зависимости.
- Реализовать Prisma schema и additive initial migration.
- Реализовать server-side crypto, cookie и request-origin helpers.

### Этап B — клиент

- `POST /api/client/start`: нормализовать имя, выбрать locale, атомарно создать сущности и cookie.
- `GET /api/client/me` и `GET /api/conversation`.
- `POST /api/conversation/messages`, read marker и attachments.
- Лендинг и полноценный Messenger с устойчивой flex/grid высотой.

### Этап C — администрация

- Отдельные `Admin`, `AdminSession`, bootstrap первого администратора вне публичного API.
- Список Active/Archive, поиск по имени/VX ID, detail, send/read.
- Notes и relational tags.
- Mobile master/detail navigation.

### Этап D — production

- Health/readiness, миграции до запуска, PM2 или Docker (один способ на порт).
- Nginx TLS reverse proxy, request limits и корректные forwarded headers.
- Backup/restore rehearsal, smoke и authorization matrix.

## 4. Что переносить из VX House

- Визуальную структуру и scroll/composer-паттерны Messenger — `ADAPT`.
- Active/Archive, unread, теги, вложения, system messages — `ADAPT`.
- `UserAvatar` и `VX ID` helpers — `COPY` после переименования доменных типов при необходимости.
- Текущую auth/session реализацию — только `REFERENCE ONLY`: клиентская модель принципиально другая, admin flow можно упростить.
- Большой support service и текущую Prisma schema — `REFERENCE ONLY`; там много запрещённого legacy scope.

Точная классификация находится в `docs/SOURCE_MANIFEST.md` и `manifest.json`.

## 5. Definition of Done

- Новый клиент создаётся одним запросом и после refresh видит тот же диалог.
- Украденный/подделанный VX ID не даёт доступа.
- Два параллельных Begin не создают коллизий VX ID; retry с idempotency key не создаёт дубль.
- Первый USER message переводит разговор в Active; открытие и welcome — нет.
- Admin видит новый Active без смешивания разговоров, может ответить, тегировать, архивировать.
- Client не может прочитать чужой разговор, tags, notes или admin endpoints.
- Composer всегда видим; скролл принадлежит message pane, последнее сообщение не перекрывается.
- Desktop/mobile, локализация, attachments, rate limits и recovery проверены.
- `/api/health` возвращает 200 только при доступной БД.

## 6. Открытые решения до начала нового проекта

- Новый domain/name/branding и точный welcome copy RU/EN/TR/AZ.
- Нужна ли cross-device recovery; если да — какой verified factor или recovery code.
- Private object storage или persistent local volume для attachments.
- Retention/erasure policy для сообщений, notes, credentials и blobs.
- Автоматически ли новое USER message reopening вручную закрытый conversation (рекомендация: да).
- Нужны ли admin MFA, несколько admin ролей и IP restrictions в первой версии.
- Является ли online/offline только demo/presence-by-lastSeen или будет realtime presence.
- PM2 или Docker Compose как единственный production process model.
