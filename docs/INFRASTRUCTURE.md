# Infrastructure

## Рекомендуемый production topology

`Internet → Nginx TLS → 127.0.0.1:3000 app → private PostgreSQL`

Private attachment storage доступен только приложению. На одном Droplet допустим PM2 **или** Docker Compose, но не оба одновременно на одном порту.

## Runtime

- Ubuntu 24.04, Node 22 LTS, pinned pnpm.
- Next-compatible standalone build, non-root process, `NODE_ENV=production`.
- PostgreSQL 16/17 на private network/loopback, SCRAM, отдельные app/migration privileges при зрелой эксплуатации.
- Persistent uploads volume либо S3-compatible storage.
- Structured logs без cookies/token/body/secret.

## Health

- `/api/health/live`: process отвечает, без БД.
- `/api/health`: readiness выполняет `SELECT 1`; 200 healthy, 503 unavailable.
- Nginx/monitoring проверяет public HTTPS readiness.

## Nginx assumptions

- TLS termination и HTTP→HTTPS.
- `proxy_pass http://127.0.0.1:3000`.
- Перезаписывать `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For` и не доверять входным spoofed values.
- `client_max_body_size 12m`, sane proxy timeouts, security headers.
- Node слушает только loopback; trust proxy включать лишь при контролируемом proxy.

## Backups

Ежедневный encrypted `pg_dump`, retention и off-host copy; отдельно backup blobs. Restore rehearsal обязателен: дамп без проверенного восстановления не является backup.
