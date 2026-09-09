# Client Identity

## Threat model

У клиента нет account login. Значит cookie содержит bearer credential: кто получил токен, тот получил доступ к разговору. Имя, UUID и `VX000123` не являются секретами и не могут использоваться для доступа.

## Создание

1. Browser отправляет `POST /api/client/start` с `displayName`, locale hint и `Idempotency-Key`.
2. Server нормализует Unicode, trim/collapse spaces, ограничивает 1–80 grapheme/символов, запрещает control characters.
3. Server создаёт 32 random bytes через CSPRNG и base64url-строку.
4. В БД сохраняется `HMAC-SHA-256(CLIENT_TOKEN_PEPPER, rawToken)` или SHA-256 при гарантированно высокой энтропии; HMAC предпочтительнее.
5. В одной transaction создаются Client, ClientCredential, Conversation, welcome Message.
6. Raw token попадает только в `Set-Cookie`, после чего уничтожается из памяти запроса и никогда не логируется.

## Cookie

Рекомендация: `__Host-vx_client`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, без `Domain`, Max-Age 180 дней. HTTPS обязателен. Для локальной разработки использовать отдельное имя или conditional Secure только в development.

## Проверка запроса

- Извлечь cookie, провалидировать длину/алфавит до hash.
- Вычислить hash и искать только active, unexpired credential.
- Все conversation queries дополнительно связывать `conversation.clientId = authenticatedClient.id`.
- Сравнения секретов выполнять constant-time там, где сравнение делается в приложении.
- Обновлять lastUsedAt с throttling, а не на каждом poll.

## Возврат, ротация и logout

- Reload/return с cookie открывает тот же разговор.
- `POST /api/client/logout` ревокирует credential и очищает cookie. Это необратимо без recovery.
- Ротация: создать новый credential, поставить cookie, затем revoke старый в одной логической операции.
- Смена displayName не должна менять identity.

## Утеря cookie

В MVP создаётся новый Client. Нельзя восстанавливать доступ только по имени/VX ID. Будущие безопасные варианты: one-time recovery code, verified email/phone или admin-assisted challenge. До реализации UI должен честно сообщать, что доступ связан с этим браузером.

## CSRF и XSS

HttpOnly не защищает от CSRF: все state-changing endpoints проверяют Origin/Host и используют SameSite. XSS остаётся критичным, поэтому CSP, React escaping, отсутствие unsafe HTML и безопасное имя файла обязательны.

## Race conditions

- `start` идемпотентен по server-stored request key/cookie.
- VX ID назначает sequence.
- Одинаковые имена разрешены; identity — UUID/token, не name.
- Параллельные запросы send используют unique idempotency constraint.
