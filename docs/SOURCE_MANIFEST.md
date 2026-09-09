# Source Manifest and Transfer Classification

Классы:

- **COPY** — небольшой независимый паттерн; проверить aliases/style после переноса.
- **ADAPT** — полезная реализация, но доменные типы/API/auth надо заменить.
- **REFERENCE ONLY** — изучить решения; прямое копирование принесёт legacy/лишние зависимости.
- **DO NOT COPY** — намеренно отсутствует в `reference/`.

## COPY

- `components/ui/user-avatar.*` — image→emoji→initials presentation.
- `components/ui/vx-id-copy.*`, `lib/vx-id.ts` — формат/search/copy VX ID.
- `lib/user-avatar.ts` — безопасный 160-emoji pool и deterministic fallback; assignment для нового проекта выполнять server-side.

## ADAPT

- `components/messenger/personal-messenger.*` — full/mini UI, scroll, composer, preview, attachments; удалить Dashboard/User assumptions и старые `/api/support` paths.
- `components/admin/admin-messenger-workspace.*` — master/detail, Active/Archive, polling, unread, responsive composer; заменить Player/User types на Client.
- `components/admin/admin-tag-controls.*`, `admin-tags.module.css` — единые tag controls.
- `components/admin/admin-users-workspace.tsx` — Participants patterns; сильно сократить columns.
- `lib/services/admin-messenger-service.ts` — scope/unread/sort/notes/files semantics, но переписать Prisma models/encryption dependencies.
- `lib/services/admin-tag-service.ts` — authorization и relational CRUD.
- `lib/services/personal-conversation.ts` — one conversation/welcome/idempotency; убрать User notifications/onboarding migration.
- admin messenger/tag API routes — сохранить boundary/rate/origin, заменить service contracts.
- client support message/read/attachment/detail routes — заменить user session на client token и `/api/conversation`.
- selected tests — переносить assertions, не fixtures старого домена.

## REFERENCE ONLY

- `lib/services/support-notification-service.ts`, repository — содержит рабочие ownership/idempotency/attachments, но также tickets, appeals, notifications.
- `lib/auth/*`, `lib/server/authentication.ts`, `authorization.ts` — user-oriented auth; годится для admin design review.
- `lib/i18n/system-messages.ts` — encoder/decoder/render pattern, словари сократить.
- `infrastructure/*` — production lessons; новый проект должен иметь собственные names/ports/env.
- `reference/prisma/current-messenger-models.prisma` и migration snapshots — только источник фактов.

## DO NOT COPY

User registration/email verification/password reset/onboarding; analytics/Keitaro; Tasks/VX Points/Trust/Rewards/ranks; Partner/CMS; production `.env`, DB/backups/uploads/logs; `node_modules`, `.next`, `dist`, `.git`; current full Prisma schema and seed data.

## Полный file-by-file inventory

Каждый файл в `reference/` классифицирован ниже; rationale для классов и групп приведён выше.

| Reference file | Class |
|---|---|
| `.env.example` | ADAPT |
| `prisma/current-messenger-models.prisma` | REFERENCE ONLY |
| `prisma/migrations/20260812090000_admin_user_tags.sql` | REFERENCE ONLY |
| `prisma/migrations/20260818090000_add_user_vx_id.sql` | REFERENCE ONLY |
| `prisma/migrations/20260821120000_add_player_avatar_emoji.sql` | REFERENCE ONLY |
| `prisma/recommended-chat-only-schema.prisma` | ADAPT |
| `source/app/api/admin/messenger/[id]/attachments/[attachmentId]/route.ts` | ADAPT |
| `source/app/api/admin/messenger/[id]/attachments/route.ts` | ADAPT |
| `source/app/api/admin/messenger/[id]/messages/route.ts` | ADAPT |
| `source/app/api/admin/messenger/[id]/notes/route.ts` | ADAPT |
| `source/app/api/admin/messenger/[id]/read/route.ts` | ADAPT |
| `source/app/api/admin/messenger/[id]/route.ts` | ADAPT |
| `source/app/api/admin/messenger/route.ts` | ADAPT |
| `source/app/api/admin/tags/[id]/route.ts` | ADAPT |
| `source/app/api/admin/tags/route.ts` | ADAPT |
| `source/app/api/admin/users/[userId]/tags/[tagId]/route.ts` | ADAPT |
| `source/app/api/support/[id]/attachments/[attachmentId]/route.ts` | ADAPT |
| `source/app/api/support/[id]/attachments/route.ts` | ADAPT |
| `source/app/api/support/[id]/messages/route.ts` | ADAPT |
| `source/app/api/support/[id]/read/route.ts` | ADAPT |
| `source/app/api/support/[id]/route.ts` | ADAPT |
| `source/components/admin/admin-messenger-workspace.module.css` | ADAPT |
| `source/components/admin/admin-messenger-workspace.tsx` | ADAPT |
| `source/components/admin/admin-tag-controls.tsx` | ADAPT |
| `source/components/admin/admin-tags.module.css` | ADAPT |
| `source/components/admin/admin-users-workspace.tsx` | ADAPT |
| `source/components/messenger/personal-messenger.module.css` | ADAPT |
| `source/components/messenger/personal-messenger.tsx` | ADAPT |
| `source/components/ui/user-avatar.module.css` | COPY |
| `source/components/ui/user-avatar.tsx` | COPY |
| `source/components/ui/vx-id-copy.module.css` | COPY |
| `source/components/ui/vx-id-copy.tsx` | COPY |
| `source/infrastructure/deployment-reference.md` | REFERENCE ONLY |
| `source/infrastructure/Dockerfile` | REFERENCE ONLY |
| `source/infrastructure/docker-compose.yml` | REFERENCE ONLY |
| `source/infrastructure/next.config.ts` | REFERENCE ONLY |
| `source/lib/admin-messenger/index.ts` | ADAPT |
| `source/lib/admin-messenger/types.ts` | ADAPT |
| `source/lib/admin-tags/index.ts` | ADAPT |
| `source/lib/admin-tags/types.ts` | ADAPT |
| `source/lib/auth/authorization-guards.ts` | REFERENCE ONLY |
| `source/lib/auth/password.ts` | REFERENCE ONLY |
| `source/lib/auth/request-origin.ts` | REFERENCE ONLY |
| `source/lib/auth/session-cookie.ts` | REFERENCE ONLY |
| `source/lib/auth/session-token.ts` | REFERENCE ONLY |
| `source/lib/i18n/system-messages.ts` | REFERENCE ONLY |
| `source/lib/repositories/prisma-support-notification-repository.ts` | REFERENCE ONLY |
| `source/lib/server/authentication.ts` | REFERENCE ONLY |
| `source/lib/server/authorization.ts` | REFERENCE ONLY |
| `source/lib/services/admin-messenger-service.ts` | ADAPT |
| `source/lib/services/admin-tag-service.ts` | ADAPT |
| `source/lib/services/personal-conversation.ts` | ADAPT |
| `source/lib/services/support-notification-service.ts` | REFERENCE ONLY |
| `source/lib/user-avatar.ts` | COPY |
| `source/lib/vx-id.ts` | COPY |
| `source/tests/functional-admin-cms-moderation.integration.test.mts` | ADAPT |
| `source/tests/functional-support-notifications.integration.test.mts` | ADAPT |
| `source/tests/personal-conversation.unit.test.mts` | ADAPT |
| `source/tests/user-avatar.unit.test.mts` | ADAPT |
| `source/tests/vx-id.unit.test.mts` | ADAPT |
