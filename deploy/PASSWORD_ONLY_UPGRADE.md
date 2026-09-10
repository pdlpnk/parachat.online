# Password-only Admin: обновление существующего Stage 4

Production не изменялся. Новых миграций нет: все пять Stage 4 migrations уже должны быть применены.
Новые env secrets не нужны. Пароль общего доступа хранится scrypt-хешем в существующей Admin DB-модели.
Техническая запись выбирается по фиксированному внутреннему идентификатору; email/displayName пользователь не вводит.
`pnpm admin:create` спрашивает только пароль дважды (TTY, скрытый ввод, 12–128 Unicode символов).
При существующем singleton script отказывается его перезаписывать. Старые Admin/сообщения не удаляются;
старые валидные sessions остаются действительными до expiry/logout/revoke, но старый email/password login больше недоступен.
Новые сессии принадлежат общему Admin. Read markers общего Admin начнутся независимо от прежних аккаунтов.

## Команды — только для ручного запуска после review

В одной SSH Bash-сессии под владельцем существующего PM2 `lina`.
Node 24 и pnpm 11.19.0 уже установлены. pm2 script/cwd должны указывать через /srv/lina/current,
а Node получать существующий /srv/lina/shared/lina.env. Не показывать `pm2 env` или содержимое env.
При ошибке остановиться. Не менять Nginx, HTTPS, DNS, PostgreSQL config и другие проекты.

```bash
set -euo pipefail
pm2 describe lina
node --version
pnpm --version
test -r /srv/lina/shared/lina.env
LINA_SHA='PASSWORD_ONLY_COMMIT_SHA_FROM_REPORT'
LINA_RELEASE="/srv/lina/releases/$LINA_SHA"
LINA_PREVIOUS="$(readlink -f /srv/lina/current)"
test ! -e "$LINA_RELEASE"
```

Backup перед созданием общего Admin (sudo права; существующая DB lina_prod):

```bash
sudo install -d -m 0700 /srv/lina/backups
LINA_BACKUP="/srv/lina/backups/lina-before-password-only-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -u postgres pg_dump -Fc --dbname=lina_prod | sudo tee "$LINA_BACKUP" >/dev/null
sudo chmod 0600 "$LINA_BACKUP"
sudo cat "$LINA_BACKUP" | sudo -u postgres pg_restore --list >/dev/null
```

Новый release, пока прежний продолжает работать:

```bash
mkdir -p /srv/lina/releases
git clone --no-checkout https://github.com/pdlpnk/parachat.online.git "$LINA_RELEASE"
cd "$LINA_RELEASE"
git checkout --detach "$LINA_SHA"
test "$(git rev-parse HEAD)" = "$LINA_SHA"
pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1
pnpm build
test -f .next/standalone/server.js
test -d .next/standalone/.next/static
```

Build включает prisma generate и standalone assets. Миграции повторно запускать не нужно.
При SIGKILL не продолжать. Не останавливать чужие процессы для освобождения памяти.

Один раз создать общий Admin; пароль не указывать в самой команде:

```bash
node --env-file=/srv/lina/shared/lina.env --import tsx scripts/create-admin.ts
```

Сохранить пароль в password manager. Не менять CLIENT_CREDENTIAL_PEPPER, DATABASE_URL или Player cookies.
Если singleton уже создан, пропустить команду: существующий пароль не будет сброшен.

Переключить current (сохраняется и symlink release, и обычная директория):

```bash
test -d /srv/lina/current
test ! -e /srv/lina/current.password-next
test ! -L /srv/lina/current.password-next
if [ -L /srv/lina/current ]; then
  LINA_PREVIOUS="$(readlink -f /srv/lina/current)"
  ln -s "$LINA_RELEASE" /srv/lina/current.password-next
  mv -Tf /srv/lina/current.password-next /srv/lina/current
else
  LINA_PREVIOUS="/srv/lina/releases/pre-password-only-$(date -u +%Y%m%dT%H%M%SZ)"
  test ! -e "$LINA_PREVIOUS"
  mv /srv/lina/current "$LINA_PREVIOUS"
  ln -s "$LINA_RELEASE" /srv/lina/current
fi
echo "Previous release: $LINA_PREVIOUS"
cd /srv/lina/current
pm2 restart lina --update-env
pm2 save
```

Проверка:

```bash
curl --fail --silent --show-error https://parachat.online/api/health/live
curl --fail --silent --show-error https://parachat.online/api/health
```

В браузере /admin: без session одно поле Пароль; неверный пароль — безопасная ошибка;
верный — Messenger; reload сохраняет session; logout возвращает к одному полю.
Старый Player сохраняет LI/history; USER и ответ Admin доставляются polling.
Для отката вернуть current на сохранённый LINA_PREVIOUS и restart только lina; не откатывать DB автоматически.
