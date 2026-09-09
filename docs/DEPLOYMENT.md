# Deployment

## Первый запуск

1. Создать отдельного OS user, каталог и отдельную PostgreSQL DB/user.
2. Скопировать `.env` из `reference/.env.example`, сгенерировать secrets локально на сервере, права `600`.
3. `pnpm install --frozen-lockfile`.
4. `pnpm exec prisma validate && pnpm exec prisma generate`.
5. `pnpm exec prisma migrate deploy`.
6. `pnpm build`; проверить standalone assets.
7. Запустить non-root через PM2/systemd либо Compose.
8. Настроить Nginx/Certbot, `nginx -t`, reload.
9. Проверить local health и public HTTPS.

## Каждый deploy

1. Зафиксировать текущий commit и сделать DB/blob backup.
2. `git pull --ff-only` на проверенный commit.
3. Frozen install, validate/generate/migrate deploy, build.
4. Graceful restart `--update-env`, сохранить process manager state.
5. Nginx test (reload только если config изменён).
6. Smoke: start client, return cookie, first message→Active, admin reply, attachment, tag, archive/reopen, health.

## Rollback

Вернуть предыдущий git commit и пересобрать/restart. Schema migrations проектировать backward-compatible; Prisma не имеет автоматического safe down. При destructive incident восстановить отдельную БД и blobs из согласованного backup. Никогда не откатывать код за несовместимую migration без runbook.

Пакет не выполняет deploy и не содержит production адресов/ключей.
