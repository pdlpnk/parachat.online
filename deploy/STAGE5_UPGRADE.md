# Stage 5: вложения и цветные теги

Команды подготовлены для ручного выполнения через SSH. В этой задаче production не менялся.
Работать под владельцем существующего PM2 `lina`, в той же сессии shell. Не запускать второй PM2 daemon.
Требуются уже установленные Node 24/pnpm 11.19, настроенные PostgreSQL/HTTPS и Stage 4.
`pm2 describe lina` должен показывать `/srv/lina/current`, `--env-file=/srv/lina/shared/lina.env`, loopback и порт 3107.
Если фактические пути/порт отличаются, остановиться и скорректировать только настройки LINA.

## 1. Новый release (текущий процесс продолжает работать)

Вставить полный SHA из финального отчёта вместо `REVIEWED_STAGE5_SHA`.

```bash
set -euo pipefail
LINA_SHA='REVIEWED_STAGE5_SHA'
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

Build уже включает standalone assets. Не копировать macOS node_modules/.next на Ubuntu.
При SIGKILL остановиться и проверить RAM/свободное место; чужие процессы не останавливать.

## 2. Приватное хранилище и env

Команды выполняет владелец процесса `lina`; каталог должен принадлежать именно ему.

```bash
install -d -m 0700 /srv/lina/shared/uploads
chmod 0700 /srv/lina/shared/uploads
nano /srv/lina/shared/lina.env
```

Добавить/обновить ровно одну строку, не печатая остальные значения:

```dotenv
ATTACHMENT_STORAGE_DIR="/srv/lina/shared/uploads"
```

Не менять DATABASE_URL, CLIENT_CREDENTIAL_PEPPER, Admin пароль или существующие session/identity данные.
Новых secrets нет. Не выполнять admin:create повторно. Env не source-ить: Node читает его через --env-file.
Убедиться, что PM2 env не содержит старого ATTACHMENT_STORAGE_DIR: переменная окружения имеет приоритет над env-file.

## 3. Backup и миграция

Короткое окно обслуживания даёт согласованный backup БД и файлов.
Останавливается **только** процесс `lina`. При любой ошибке не продолжать следующие блоки автоматически.

```bash
pm2 stop lina
sudo install -d -m 0700 /srv/lina/backups
LINA_BACKUP="/srv/lina/backups/stage5-$(date -u +%Y%m%dT%H%M%SZ)"
sudo -u postgres pg_dump -Fc --dbname=lina_prod | sudo tee "$LINA_BACKUP.dump" >/dev/null
sudo chmod 0600 "$LINA_BACKUP.dump"
sudo cat "$LINA_BACKUP.dump" | sudo -u postgres pg_restore --list >/dev/null
sudo tar -C /srv/lina/shared -czf "$LINA_BACKUP.uploads.tar.gz" uploads
sudo chmod 0600 "$LINA_BACKUP.uploads.tar.gz"
cd "$LINA_RELEASE"
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js migrate deploy
```

Новая миграция: `20260910020000_attachments_tag_colors`. Существующие теги получают `gray`.
Attachment таблица переиспользуется; обновляются ограничения форматов и file-only сообщений.
Backup хранить также вне Droplet; проверка списка dump не заменяет пробное восстановление.

## 4. Nginx: только существующий HTTPS server block LINA

Открыть **существующий** LINA vhost (обычный путь ниже; сначала проверить ссылку).
Не заменять весь конфиг примером, не менять сертификат, DNS, другие vhosts или зоны.
Зоны `lina_general` и `lina_send` должны уже существовать в http scope, как в текущем примере.
Не дублировать location, если уже добавлены.

```bash
readlink -f /etc/nginx/sites-enabled/lina.conf
sudoedit /etc/nginx/sites-available/lina.conf
```

Внутри HTTPS server добавить два location; proxy headers наследуются от его существующей конфигурации:

```nginx
location = /api/player/attachments {
    client_max_body_size 11m;
    limit_req zone=lina_general burst=10 nodelay;
    limit_req zone=lina_send burst=5 nodelay;
    proxy_pass http://127.0.0.1:3107;
}
location ~ ^/api/admin/conversations/[0-9a-fA-F-]+/attachments$ {
    client_max_body_size 11m;
    limit_req zone=lina_general burst=10 nodelay;
    limit_req zone=lina_send burst=5 nodelay;
    proxy_pass http://127.0.0.1:3107;
}
```

Не создавать alias/root для uploads. GET остаётся через авторизованный backend.
Если существует `location ^~ /api/`, он не должен подавлять новый regex location.
Сохранить маленькие лимиты text API и существующие proxy headers/Origin.

```bash
sudo nginx -t
```

## 5. Переключение current

Если current — symlink:

```bash
test -L /srv/lina/current
test ! -e /srv/lina/current.stage5-next
ln -s "$LINA_RELEASE" /srv/lina/current.stage5-next
mv -Tf /srv/lina/current.stage5-next /srv/lina/current
```

Если current — обычный каталог, выполнить вместо предыдущего блока:

```bash
test -d /srv/lina/current && test ! -L /srv/lina/current
LINA_PREVIOUS="/srv/lina/releases/pre-stage5-$(date -u +%Y%m%dT%H%M%SZ)"
mv /srv/lina/current "$LINA_PREVIOUS"
ln -s "$LINA_RELEASE" /srv/lina/current
```

```bash
pm2 restart lina --update-env
sudo systemctl reload nginx
pm2 save
curl --fail --silent --show-error http://127.0.0.1:3107/api/health/live
curl --fail --silent --show-error http://127.0.0.1:3107/api/health
curl --fail --silent --show-error https://parachat.online/api/health
```

Nginx reload перечитывает общую конфигурацию, но изменяется только LINA vhost. Другие проекты не перезапускаются.
Если smoke не прошёл, вернуть current на `$LINA_PREVIOUS`, restart только lina. Автоматически не откатывать DB:
новые file-only сообщения не отображают вложения в старом Stage 4. Для полноценного возврата нужен отдельный план
с сохранением новых данных; не применять reset/db push/удаление миграций.

## 6. Smoke в браузере

- Старый Player: тот же LI ID/history после reload; новый anonymous Start работает.
- Player/Admin: текст, JPEG/PNG/WebP, PDF, MP4; текст+файл и файл без текста.
- Preview/remove; неверный файл сохраняет текст; retry не создаёт дубликаты.
- Изображение full-size; MP4 controls/seek без autoplay; PDF download.
- Другой Player и anonymous не получают файл; Admin logout закрывает доступ.
- Password-only /admin; Secure/HttpOnly/SameSite=Lax cookies сохраняются.
- Цветные теги: attach/remove, create/rename/color/delete; фильтр; 2 chips +N.
- 320/360/390/414/430, landscape, короткий desktop: нет горизонтального скролла, composer доступен.

## 7. Последующие backups и orphan cleanup

Backup всегда включает БД **и** `/srv/lina/shared/uploads`, плюс отдельное защищённое хранение существующего env.
Для согласованного snapshot повторять блок backup при кратко остановленном `lina`, затем запускать его обратно.

После ошибок загрузки могут остаться приватные файлы без DB-ссылки. Dry run (без удаления):

```bash
cd /srv/lina/current
node --env-file=/srv/lina/shared/lina.env --import tsx scripts/cleanup-attachments.ts
```

После проверки, в отдельное согласованное окно при остановленных загрузках:

```bash
pm2 stop lina
node --env-file=/srv/lina/shared/lina.env --import tsx scripts/cleanup-attachments.ts --delete
pm2 restart lina --update-env
```

Удаляются только непривязанные обычные файлы с opaque key старше 24 часов. При ошибке DB cleanup прекращается.
Никакой cron не устанавливается. Контролировать свободное место; в MVP нет транскодирования, антивирусного сканера и storage quota.
