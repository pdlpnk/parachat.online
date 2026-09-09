# Admin Authentication

Клиентская token-cookie и admin authentication должны быть полностью раздельны: разные таблицы, cookie names, middleware и API namespaces.

## Минимальный flow

- Bootstrap первого администратора выполняется CLI/seed с secret input, не публичным endpoint.
- Login по email + password hash (Argon2id предпочтительно; scrypt допустим).
- Random opaque admin session token, в БД только HMAC/hash.
- Cookie `__Host-vx_admin`, HttpOnly/Secure/SameSite=Strict или Lax по UX, короткий idle timeout и absolute timeout.
- Logout/revoke password change инвалидирует только сессии соответствующего admin.

## Authorization

На каждом `/api/admin/**` route server-side проверять admin session и permission. Для MVP достаточно `ADMIN` роли, но проверка не должна зависеть от скрытого UI или email allowlist.

Client routes никогда не сериализуют tags, internal notes, admin email/session metadata. Admin routes никогда не принимают client cookie как authority.

## Защита

- Rate limit login по normalized email + network hint.
- Generic invalid-credentials response без account enumeration.
- Origin validation на login/logout и всех mutations.
- Regenerate session после login; password hash/tokens не логировать.
- Audit create/rename/delete tag, note operations, archive/reopen и attachment access.

Текущие VX House auth helpers приложены как `REFERENCE ONLY`: они содержат user-centric assumptions и не должны копироваться без выделения отдельного Admin principal.
