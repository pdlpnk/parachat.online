# Database

Рекомендуемая полная схема находится в `reference/prisma/recommended-chat-only-schema.prisma`. Это новая схема для отдельной БД; её нельзя применять к VX House.

## Минимальные сущности

- `Client`: UUID, последовательный `vxId`, displayName, locale, avatarEmoji, timestamps.
- `ClientCredential`: hashed opaque token, clientId, expiry/revocation/lastUsed; позволяет ротацию без изменения Client.
- `Conversation`: unique clientId, firstUserMessageAt, lastMessageAt, closedAt.
- `Message`: conversation, author type, typed author FK, text либо system key/params, idempotency key.
- `Attachment`: metadata и opaque storageKey; bytes хранятся вне таблицы.
- `ClientConversationRead` / `AdminConversationRead`: отдельные markers, чтобы read не менял сортировку.
- `Admin`, `AdminSession`: независимая admin-only identity.
- `AdminTag`, `ClientTag`: нормальная many-to-many связь.
- `InternalNote`: admin-only.

## VX ID

Использовать PostgreSQL sequence и DB default, формат `VX` + 6 цифр. Unique constraint обязателен. Sequence безопаснее `count()+1` и не требует блокировать таблицу. Пропуски после rollback допустимы; VX ID — идентификатор, не порядковая бухгалтерская нумерация.

## Referential actions

- Удаление tag удаляет только join rows.
- Удаление client в обычном UI не предоставляется. Если retention policy требует erase, транзакционно удалить credential/messages/attachments/notes/tag relations/conversation/client и физические blobs.
- Историю сообщений предпочтительно не cascade-удалять случайной admin-операцией.

## Индексы

- `Client(vxId)`, `Client(displayName)` с trigram/normalized search при необходимости.
- `Message(conversationId, createdAt, id)`.
- `Conversation(firstUserMessageAt, closedAt, lastMessageAt)`.
- read-marker unique `(conversationId, principalId)`.
- tag join `(tagId, clientId)` и primary `(clientId, tagId)`.

## Миграции

Каждый deploy: backup → `prisma validate` → `prisma generate` → `prisma migrate deploy` → build/restart. Никаких `db push` на production. Backfill делать отдельным идемпотентным SQL/скриптом и измерять NULL/duplicate до и после.
