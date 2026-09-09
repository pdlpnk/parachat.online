# Administrative Tags

- `AdminTag(name UNIQUE)` + `ClientTag(clientId, tagId)` с composite PK.
- Названия — admin content, их не переводить; trim/collapse spaces, 1–60 chars, case-insensitive uniqueness рекомендуется через normalizedName/citext.
- Create/rename/delete/assign/unassign доступны только admin server-side.
- Удаление tag удаляет join rows, не Client и не Conversation.

## UI

- В chat list и Participants показывать 2–3 compact chips, затем `+N`.
- В header диалога — те же данные и popover управления.
- Сверху: `Active | Archive`, ниже horizontal scroll `All | tag…`.
- Сохранять selected filter локально по admin, но валидировать: удалённый tag сбрасывает на All.
- На mobile popover превращать в dialog/bottom sheet, не расширять ширину chat item.

Messenger и Participants используют одни endpoints и relation. Не создавать две tag системы.
