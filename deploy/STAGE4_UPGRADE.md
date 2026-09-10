# Stage 4: обновление существующей LINA после review

Ни одна команда здесь не запускалась на production. Работать только с LINA.
Не повторять первоначальную установку PostgreSQL/Node/Nginx, не менять DNS.
Сначала подтвердить пользователя, под которым уже работает PM2 LINA, путь его
PM2_HOME, Node/pnpm и current. Снимок предыдущего терминала показывал root;
это не доказывает, что PM2 сейчас принадлежит root. Не запускать второй PM2 daemon.

## Предпосылки

- `/srv/lina/current` — Git checkout либо symlink на release, есть свободное место для нового release.
- `/srv/lina/shared/lina.env` — существующий приватный env, сохраняется без изменений.
- Node 24, pnpm 11.19.0, PostgreSQL с ICU (`SELECT count(*) FROM pg_collation WHERE collprovider='i';`).
- В env остаются DATABASE_URL, CLIENT_CREDENTIAL_PEPPER, LINA_ORIGIN и runtime NODE_ENV/HOSTNAME/PORT.
- Никаких новых production env secrets не требуется. Admin пароль вводится только в CLI и хранится в password manager.
- CLIENT_CREDENTIAL_PEPPER нельзя менять: существующие Player credentials потеряют доступ. DB сохранять вместе с хешами, идентичностями и историей.
- Миграция Unicode нормализует существующие теги. До Stage 4 их обычно нет. Конфликт имён останавливает миграцию атомарно; не удалять/сливать данные автоматически.

## Команды по порядку

Блоки выполняет владелец существующего процесса LINA, кроме отдельно отмеченного backup.
Заменить REVIEWED_FULL_COMMIT_SHA полным SHA из финального отчёта. Не подставлять main вместо SHA.
`node`, `pnpm`, `pm2` должны разрешаться в существующий runtime LINA. Не выполнять `pm2 restart all`.

1. Backup **только LINA** (SSH admin с sudo; имя DB сверить с текущим env, не печатая пароль):

```bash
set -euo pipefail
sudo install -d -m 0700 /srv/lina/backups
LINA_BACKUP="/srv/lina/backups/lina-prod-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -u postgres pg_dump -Fc --dbname=lina_prod | sudo tee "$LINA_BACKUP" >/dev/null
sudo chmod 0600 "$LINA_BACKUP"
sudo cat "$LINA_BACKUP" | sudo -u postgres pg_restore --list >/dev/null
```

Скопировать dump в защищённое внешнее хранилище согласно принятой backup-политике.
Проверка списка dump не заменяет пробное восстановление в отдельной БД.

2. Подготовить новый release, сохраняя текущий работающий build:

```bash
set -euo pipefail
LINA_SHA='REVIEWED_FULL_COMMIT_SHA'
LINA_RELEASE="/srv/lina/releases/$LINA_SHA"
LINA_PREVIOUS="$(readlink -f /srv/lina/current)"
test ! -e "$LINA_RELEASE"
test -r /srv/lina/shared/lina.env
node --version
pnpm --version
pm2 describe lina
mkdir -p /srv/lina/releases
git clone --no-checkout https://github.com/pdlpnk/parachat.online.git "$LINA_RELEASE"
cd "$LINA_RELEASE"
git checkout --detach "$LINA_SHA"
test "$(git rev-parse HEAD)" = "$LINA_SHA"
pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js generate
pnpm build
```

`pnpm build` генерирует Prisma Client и копирует standalone assets. Build до migration
возможен: динамические страницы не обращаются к DB при сборке. Не копировать .next/node_modules с macOS.
На малом Droplet заранее проверить RAM/swap; при SIGKILL остановиться, не трогать чужие процессы.

3. Применить совместимые добавочные миграции и создать первого Admin:

```bash
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js migrate deploy
node --env-file=/srv/lina/shared/lina.env --import tsx scripts/create-admin.ts
```

CLI спросит email (ASCII), имя и дважды пароль 12–128 Unicode символов, скрывая ввод.
Пропустить создание, если нужный Admin уже существует; script не перезаписывает аккаунты.

4. Переключить current и перезапустить **существующий** PM2 process `lina`.
Если current уже symlink:

```bash
test -L /srv/lina/current
ln -s "$LINA_RELEASE" /srv/lina/current.stage4-next
mv -Tf /srv/lina/current.stage4-next /srv/lina/current
pm2 restart lina --update-env
pm2 save
```

Если current — обычная директория, вместо предыдущих четырёх строк сохранить её:

```bash
test -d /srv/lina/current && test ! -L /srv/lina/current
LINA_PREVIOUS="/srv/lina/releases/pre-stage4-$(date -u +%Y%m%dT%H%M%SZ)"
mv /srv/lina/current "$LINA_PREVIOUS"
ln -s "$LINA_RELEASE" /srv/lina/current
pm2 restart lina --update-env
pm2 save
```

Перед этим `pm2 describe lina` должен показывать script/cwd через `/srv/lina/current`,
тот же env-file, loopback и существующий порт (рекомендация 3107). Если нет — сначала согласовать
точное изменение только конфигурации LINA, не выполнять restart вслепую.

5. Smoke (использовать фактический текущий port):

```bash
curl --fail --silent --show-error http://127.0.0.1:3107/api/health/live
curl --fail --silent --show-error http://127.0.0.1:3107/api/health
curl --fail --silent --show-error https://parachat.online/api/health
curl --silent --output /dev/null --write-out '%{http_code}\n' https://parachat.online/dev/messenger
```

Ожидается 404 для последнего. В браузере: прежний Player сохраняет LI/history после reload;
/admin перенаправляет anonymous на login; login устанавливает отдельную Secure HttpOnly cookie;
USER делает Active/unread; Admin reply появляется в Player без reload; read не меняет порядок;
Archive/reopen, поиск имени/LI, теги и mobile back/composer работают; logout закрывает API.

## Nginx

Основной `/` proxy уже обслуживает новые endpoints; изменение Nginx не является условием запуска.
В `nginx-lina.conf.example` добавлен отдельный per-IP admin-login limit 5/min + burst 5.
При отдельном подтверждённом изменении перенести **только** зону lina_admin_login и location
/api/admin/login в существующий LINA vhost, сохранить домен/сертификаты/порт; `sudo nginx -t`
до reload. Не заменять весь config примером и не применять к другим vhosts.
Backend ceiling 20 login attempts/min глобально действует и без Nginx; это MVP-компромисс:
атака может временно блокировать все admin logins. IP-лимит на доверенном reverse proxy уменьшает риск.

## Откат приложения

При неуспешном smoke вернуть symlink current на сохранённый `$LINA_PREVIOUS`, restart только lina, save.
Не откатывать DB через db push/reset/ручное удаление миграций. Добавленные таблица/index/collation
совместимы с Stage 3; DB restore — отдельное решение с учётом новых сообщений после backup.
