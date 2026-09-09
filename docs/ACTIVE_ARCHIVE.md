# Active / Archive

## Как это фактически сделано сейчас в VX House

Admin service выбирает только не disabled профили разрешённых PLAYER/PARTNER ролей со статусом `VERIFIED`, для каждого обеспечивает personal conversation, затем считает сообщения `SupportMessage.authorType=USER`. Текущий `archived` равен `USER message count === 0 OR conversation.status === CLOSED`; Active — обратное. SYSTEM onboarding/welcome и OPERATOR reply не активируют. Admin unread — USER messages после timestamp из `SupportConversation.context.adminMessengerReads[adminId]`; mark-read сохраняет прежний `conversation.updatedAt`, чтобы диалог не пересортировался. Список сортируется по времени последнего сообщения по убыванию. Это поведение сохраняем, но в новой схеме делаем typed columns/read tables.

## Формальное правило

- **Active:** `firstUserMessageAt IS NOT NULL AND closedAt IS NULL`.
- **Archive:** `firstUserMessageAt IS NULL OR closedAt IS NOT NULL`.

Таким образом созданный клиент с welcome SYSTEM message виден администратору в Archive. Открытие Messenger, polling, read и OPERATOR/SYSTEM message не меняют scope.

## Первое сообщение

В transaction создания USER message:

1. сохранить Message;
2. `UPDATE Conversation SET firstUserMessageAt = COALESCE(firstUserMessageAt, now), closedAt = NULL, lastMessageAt = now`;
3. commit;

Admin list увидит Active на следующем poll. Не вычислять активацию по `messages.length` или последнему message author: это ломается на system welcome.

## Archive workflow

Ручное archive выставляет `closedAt` и аудит. История не удаляется. Рекомендованный policy: новое USER message reopening conversation, чтобы обращение не потерялось.

## Unread

Admin unread = число USER messages после `AdminConversationRead.lastReadAt/lastReadMessageId`. Client unread = OPERATOR/SYSTEM после Client marker. Read marker хранить отдельно; он не должен обновлять `Conversation.lastMessageAt`, иначе чтение меняет сортировку.

## Теги

Tag filter — дополнительное условие к scope: `Active AND tag=HOT` или `Archive AND tag=TR`. Клиент с несколькими тегами входит в каждый соответствующий filter. `All` не означает отдельный tag.
