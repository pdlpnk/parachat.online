# Dependencies

Рекомендуемый минимальный набор (версии фиксировать lockfile на момент создания нового repo):

- Runtime: Node 22 LTS, pnpm.
- UI/server: Next.js + React + TypeScript.
- DB: PostgreSQL + Prisma Client/CLI + `pg` adapter при выбранной Prisma версии.
- UI: `lucide-react`; `framer-motion` только для существующих мягких transitions и reduced-motion support.
- Validation: выбрать один schema validator (например Zod) вместо ручного разнобоя.
- Password hashing admin: `argon2` либо audited scrypt wrapper.
- Object storage: AWS S3-compatible SDK только если не local persistent volume.

Не переносить из VX House зависимости Cloudflare/Wrangler, analytics, email provider, CMS, rewards/tasks или Drizzle, если новый код их не использует. `server-only` полезен для crypto/repository modules. ESLint, TypeScript и test runner — dev dependencies.

Каждая зависимость должна иметь конкретного импортёра. После scaffold выполнить `pnpm why`, удалить unused и включить Renovate/Dependabot с controlled updates.
