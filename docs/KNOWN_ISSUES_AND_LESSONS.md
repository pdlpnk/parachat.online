# Known Issues and Lessons

1. **Help Desk leakage.** Current services/models still называют сущности Support и содержат category/priority/status. Новый продукт должен иметь neutral Conversation API.
2. **Composer disappearing.** Sticky не спасает при сломанной ancestor height chain. Использовать flex column + `min-height:0` + единственный message scroll owner.
3. **Last message unreachable.** Не скроллить outer page; учитывать composer height/bottom padding и short desktop viewports.
4. **Read causes reorder.** Сохранение read metadata в conversation context легко обновляет `updatedAt`; read markers должны быть отдельными.
5. **Activation by system messages.** Active вычислять по `firstUserMessageAt`, не наличию любых сообщений.
6. **Polling closure/races.** Avoid interval dependency on full messages array; abort stale requests and merge by ID.
7. **Attachment coupling.** Сначала text message, затем upload может оставить placeholder message при upload failure. Новый API может делать draft/message+file transaction-like orchestration либо явно показывать failed attachment.
8. **Large encrypted blobs in DB.** Безопасно, но дорого для backups; private object storage обычно лучше.
9. **Identity recovery.** Cookie-only identity не переносится на новое устройство. VX ID нельзя превращать в пароль.
10. **Duplicate names.** Нормальны; admin различает по VX ID/emoji/internal UUID. Поиск не должен предполагать уникальное имя.
11. **Locale.** SYSTEM key локализуется, пользовательский текст не переводится; browser/VPN не определяет identity.
12. **Over-copying.** Большой VX House service тянет auth, notifications, appeals и permissions. Переписать минимальный application service проще и безопаснее.
13. **Proxy trust.** Forwarded headers доверять только при loopback/private upstream и Nginx overwrite.
14. **Migration rollback.** Откат кода не откатывает DB; initial/new-site schema разворачивать только в отдельной базе.
