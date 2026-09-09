# Sanitized deployment reference (REFERENCE ONLY)

This excerpt records the useful current VX House topology without copying its production domain, email provider, analytics workers, secrets or host-specific values.

## Topology

`Internet → HTTPS Nginx → HTTP 127.0.0.1:3000 → standalone Node process → PostgreSQL`

The application process is managed by PM2 in the current installation. Docker Compose is an alternative, not a second concurrent process on the same port.

## Build/deploy order

```text
git pull --ff-only
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm build
pm2 restart <app-name> --update-env
pm2 save
nginx -t
systemctl reload nginx
```

Create a PostgreSQL/blob backup first. Use a new repository, new database/user, new environment, new PM2 name, new domain, new Nginx site and new TLS certificate for the chat-only project.

## Reverse proxy contract

Nginx terminates TLS, redirects HTTP to HTTPS, proxies only to loopback, overwrites Host/forwarded headers, allows a body slightly larger than the app attachment limit and applies appropriate timeouts/security headers. The app may trust proxy headers only while it is unreachable directly from the Internet.

## Verification

Check local readiness, public HTTPS readiness/database pass, process status, Nginx syntax, persistent uploads and a two-principal conversation smoke test. Never log or print environment secrets.
