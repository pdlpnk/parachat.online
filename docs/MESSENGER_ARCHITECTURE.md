# Messenger Architecture

## Слои

- **Route/UI:** преобразует locale и view-model; не содержит authorization-решений.
- **API handlers:** cookie/origin/rate limit/input parsing, единый error mapping.
- **Application services:** транзакции, idempotency, Active/Archive и unread semantics.
- **Repositories:** Prisma queries с обязательным identity scope.
- **Protection/storage:** token hashing, optional message encryption, attachment storage.

## Conversation lifecycle

- Создаётся автоматически вместе с Client.
- Не имеет пользовательских category/topic/priority.
- `closedAt` используется для ручного архива; повторное USER message может либо reopening, либо оставаться закрытым — выбрать один policy и покрыть тестом. Рекомендация: реальный USER message атомарно очищает `closedAt`.
- `lastMessageAt` обновляется только при сообщении, не при чтении/тегировании/заметке.
- `firstUserMessageAt` устанавливается один раз через условный update в транзакции сообщения.

## Типы сообщений

- `USER`: создан client credential; активирует разговор.
- `OPERATOR`: создан admin session; не активирует ещё не начатый клиентом разговор.
- `SYSTEM`: server-owned event; никогда не активирует.

`authorId` должен соответствовать типу: clientId для USER, adminId для OPERATOR, null для SYSTEM. Проверять это application service, а не доверять payload.

## Идемпотентность и порядок

- Клиент генерирует `Idempotency-Key` на send/start; сервер хранит уникальную пару `(conversationId, idempotencyKey)`.
- Серверное время — источник `createdAt`; UI сортирует `createdAt, id`.
- Повтор запроса возвращает уже созданное сообщение.
- Conversation version или transaction isolation защищают конкурирующие send/read операции.

## Realtime MVP

Использовать polling: активный диалог 3–5 секунд, список admin 5–10 секунд, background tab — 20–30 секунд. Запрашивать `after=<cursor>` вместо полной истории при росте нагрузки. Детали в `REALTIME.md`.
