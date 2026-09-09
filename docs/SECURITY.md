# Security Checklist

- 32-byte CSPRNG client/admin tokens; в БД только keyed hash.
- Раздельные client/admin cookies и principals; Secure, HttpOnly, SameSite, `__Host-`.
- Origin/Host validation на всех mutations; Node не публичен напрямую.
- Ownership condition встроен в каждый client repository query.
- Admin authorization server-side для list/detail/tags/notes/files.
- Rate limits: start, send, upload, admin login; network hint только от trusted proxy.
- Anti-spam: honeypot/minimum form time, burst+daily creation limits, message throttling и optional challenge после риска; не блокировать всех клиентов за одним NAT одним жёстким IP bucket.
- Input limits: имя, message 1–5000, tag 1–60, note limit, pagination caps.
- React escaping; запрет raw HTML; CSP, frame-ancestors, nosniff, Referrer-Policy.
- Файлы private, MIME/magic/size проверены, filenames sanitized, no execution/static serve.
- Secrets только environment/secret manager; redaction cookies, Authorization, DB URL.
- DB TLS/least privilege, backups encrypted, restore tested.
- Dependency lockfile, CI audit/SBOM, pinned runtime images.
- Audit admin mutations, но не message plaintext/token hash.
- Retention/erasure policy включает DB и blobs и не оставляет orphan files.

## Authorization tests, которые нельзя пропускать

Client A не читает/пишет conversation/attachment Client B даже при знании UUID. Client не получает tags/notes. Unauthenticated admin routes → 401; client credential на admin route → 401; non-admin principal → 403. Invalid Origin → 403 до side effect.
