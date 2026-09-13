# Stage 6 — ручное обновление работающего Stage 5

Команды не выполнялись на production. Только LINA, PM2 `lina`, `/srv/lina/current`,
существующий env `/srv/lina/shared/lina.env`, PostgreSQL `lina_prod`, HTTPS parachat.online.
Выполнять под владельцем существующего PM2 daemon в одной SSH shell; не запускать второй daemon.
Проверить `pm2 describe lina`: cwd/script должны идти через current, Node 24 и node_args с существующим env-file.
Nginx/DNS/HTTPS/другие проекты не требуют изменений. Новых env/secrets нет.

## 1. Подготовка нового release

Вставить полный SHA из итогового ответа. Не использовать плавающий main.

```bash
set -euo pipefail
LINA_SHA='REVIEWED_STAGE6_SHA'
LINA_RELEASE="/srv/lina/releases/$LINA_SHA"
LINA_PREVIOUS="$(readlink -f /srv/lina/current)"
node --version
pnpm --version
pm2 describe lina
test -r /srv/lina/shared/lina.env
test ! -e "$LINA_RELEASE"
mkdir -p /srv/lina/releases
git clone --no-checkout https://github.com/pdlpnk/parachat.online.git "$LINA_RELEASE"
cd "$LINA_RELEASE"
git checkout --detach "$LINA_SHA"
test "$(git rev-parse HEAD)" = "$LINA_SHA"
pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js generate
pnpm build
```

Build включает standalone assets. При SIGKILL остановиться и проверить RAM/swap; чужие процессы не останавливать.

## 2. Согласованный backup БД и uploads

Короткое окно обслуживания. При ошибке не продолжать автоматически; вернуть запуск прежнего `lina`, если migration ещё не началась.

```bash
pm2 stop lina
sudo install -d -m 0700 /srv/lina/backups
LINA_BACKUP="/srv/lina/backups/pre-stage6-$(date -u +%Y%m%dT%H%M%SZ)"
sudo -u postgres pg_dump -Fc --dbname=lina_prod | sudo tee "$LINA_BACKUP.dump" >/dev/null
sudo chmod 0600 "$LINA_BACKUP.dump"
sudo cat "$LINA_BACKUP.dump" | sudo -u postgres pg_restore --list >/dev/null
sudo tar -C /srv/lina/shared -czf "$LINA_BACKUP.uploads.tar.gz" uploads
sudo chmod 0600 "$LINA_BACKUP.uploads.tar.gz"
```

Для нестандартного ATTACHMENT_STORAGE_DIR использовать фактический каталог из существующей настройки.
Сохранить backup вне Droplet. Существующий env хранится отдельно в защищённом backup.

## 3. Одна новая миграция

```bash
cd "$LINA_RELEASE"
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js migrate deploy
```

`20260913010000_player_preferences`: добавляет FA и uiTheme/uiFont с defaults light/modern.
Не выполнять db push/reset, не менять pepper или пароль Admin, не создавать нового Admin.

## 4. Переключение current

Если current — symlink:

```bash
test -L /srv/lina/current
test ! -e /srv/lina/current.stage6-next
ln -s "$LINA_RELEASE" /srv/lina/current.stage6-next
mv -Tf /srv/lina/current.stage6-next /srv/lina/current
```

Если current — обычный каталог, выполнить вместо предыдущего блока:

```bash
test -d /srv/lina/current && test ! -L /srv/lina/current
LINA_PREVIOUS="/srv/lina/releases/pre-stage6-$(date -u +%Y%m%dT%H%M%SZ)"
mv /srv/lina/current "$LINA_PREVIOUS"
ln -s "$LINA_RELEASE" /srv/lina/current
```

```bash
pm2 restart lina --update-env
pm2 save
curl --fail --silent --show-error http://127.0.0.1:3107/api/health/live
curl --fail --silent --show-error http://127.0.0.1:3107/api/health
curl --fail --silent --show-error https://parachat.online/api/health
```

Использовать фактический текущий порт, если он отличается от 3107.

## 5. Smoke

- Старый Player: тот же LI, история/attachments после reload; первоначально Light/Modern и прежний locale.
- Gear → пять тем/три шрифта/пять языков; немедленная смена и сохранение после reload.
- Anonymous landing → язык → имя → Start; выбранный locale сохранён.
- Welcome меняется вместе с locale; USER/OPERATOR текст не переводится.
- FA: RTL, читаемые LI/URL/имена файлов; 320px, landscape, реальная экранная клавиатура.
- Image/PDF/MP4, preview/remove/error/retry; read/unread/polling.
- /admin password-only, reply, archive и colored tags прежние; тема Player не влияет на Admin.
- /dev/messenger по-прежнему 404 в production.

## Rollback

Остановиться при failed migration или failed smoke. Не удалять migration metadata и не менять FA обратно в БД автоматически.
Старый Prisma Client Stage 5 не знает enum FA: после появления клиентов с FA откат к Stage 5 не гарантирован.
Для возврата приложения нужен совместимый build; восстановление backup — отдельное решение с учётом новых сообщений.
