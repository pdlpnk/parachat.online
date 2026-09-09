# API Contract

Все ответы JSON, кроме attachment bytes. Ошибки имеют форму `{ code, message, requestId }`; `message` локализуется UI, `code` стабилен.

## Public/client

| Method | Path | Назначение |
|---|---|---|
| POST | `/api/client/start` | Создать/вернуть Client; Set-Cookie |
| GET | `/api/client/me` | Безопасный client view |
| POST | `/api/client/logout` | Revoke credential и clear cookie |
| GET | `/api/conversation?after=` | Собственный conversation/messages |
| POST | `/api/conversation/messages` | USER message; first message activates |
| POST | `/api/conversation/read` | Client read marker |
| POST | `/api/conversation/attachments` | Upload к собственному USER message |
| GET | `/api/conversation/attachments/:id` | Авторизованная загрузка bytes |

`start`: body `{ displayName, locale }`; сервер не принимает clientId/vxId. `messages`: `{ body }` + header `Idempotency-Key`; authorType и authorId назначает сервер.

## Admin

| Method | Path | Назначение |
|---|---|---|
| POST | `/api/admin/auth/login` | Admin login |
| POST | `/api/admin/auth/logout` | Revoke admin session |
| GET | `/api/admin/conversations?scope=&q=&tag=&cursor=` | Active/Archive list |
| GET | `/api/admin/conversations/:id` | Detail, messages, tags, notes |
| POST | `/api/admin/conversations/:id/messages` | OPERATOR message |
| POST | `/api/admin/conversations/:id/read` | Admin read marker |
| POST | `/api/admin/conversations/:id/archive` | Закрыть/архивировать |
| POST | `/api/admin/conversations/:id/reopen` | Вернуть |
| POST/GET | `/api/admin/conversations/:id/attachments` | Admin upload/download |
| GET/POST | `/api/admin/tags` | List/create |
| PATCH/DELETE | `/api/admin/tags/:id` | Rename/delete |
| POST/DELETE | `/api/admin/clients/:id/tags/:tagId` | Assign/unassign |
| POST/PATCH/DELETE | `/api/admin/conversations/:id/notes` | Internal notes |

## Status codes

- 200/201 success; 204 delete/read without body.
- 400 validation; 401 no/invalid credential; 403 valid principal without permission or bad Origin.
- 404 также использовать для чужого client resource, чтобы не подтверждать его существование.
- 409 idempotency conflict/name tag conflict; 413 oversized; 415 MIME; 429 limit; 503 dependency unavailable.

## Headers

- `Cache-Control: no-store` для identity, conversations и attachments.
- `X-Content-Type-Options: nosniff` и безопасный `Content-Disposition` для файлов.
- Nginx и приложение ограничивают body; приложение проверяет фактический byte size и magic bytes.
