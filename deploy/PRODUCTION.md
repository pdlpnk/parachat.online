# LINA — initial production deployment preparation (исторический runbook)

Для обновления существующего Stage 3 до Admin Messenger используйте [STAGE4_UPGRADE.md](STAGE4_UPGRADE.md). Нижний runbook описывает первоначальную установку; не повторять его поверх работающего сервера.

Подготовлено 2026-09-09. Продуктовая логика, зависимости, schema и migrations не изменены. Stage 4/Admin не начаты. Ни одна команда ниже не выполнялась на сервере: это runbook для отдельного явно подтверждённого запуска.

## Проверка готовности

Stage 3 report: 23 unit, 40 DB tests, два production-mode HTTP smoke (новый — 104 ответа), production standalone build PASS. Проверены текущие package scripts, runtime validator, crypto, instrumentation, standalone server.js и assets. `pnpm build` уже выполняет `prisma generate && next build && node scripts/prepare-standalone.mjs`; public (если есть) и .next/static копируются. Дополнительный deployment JS/shell-script не нужен.

Standalone подходит PM2 + Nginx. Запускать `.next/standalone/server.js`, не `next start` и не `next dev`. HOSTNAME/PORT должны быть установлены ДО server.js; его default bind без HOSTNAME — 0.0.0.0, поэтому PM2 явно задаёт loopback. Node `--env-file` загружает внешний env до startup validation; это также решает то, что Prisma CLI автоматически читает `.env`, а не произвольный production env-файл.

Рекомендуемый app port: **127.0.0.1:3107**, предварительно проверить свободен ли он. При изменении порта синхронно изменить env template/реальный env, PM2 JSON и все proxy_pass. Один fork process; рабочая точка для небольшого Droplet — 2 vCPU/4 GB RAM, но реальная пригодность зависит от свободных ресурсов и нагрузки. Linux dependencies/build создаются на Ubuntu: не переносить macOS node_modules/.next как production artifact.

Nginx и PM2 отсутствуют в текущем локальном окружении: их config/startup не проверялись запуском здесь. Это не production-ready аттестация сервера. Перед включением обязателен `nginx -t`, локальная readiness и HTTPS smoke. Пакеты Ubuntu, версии/порты PostgreSQL, DNS и существующие сервисы удалённо не инспектировались.

## Изоляция от VX House и других проектов

Самый простой вариант без влияния на другие процессы — отдельный Droplet и отдельный домен/поддомен LINA. При shared Droplet разрешён только согласованный отдельный namespace: OS user `lina`, `/srv/lina`, PM2_HOME `/srv/lina/.pm2`, app `lina`, service `pm2-lina`, port 3107, role `lina_app`, DB `lina_prod`, vhost `lina.conf`, certificate `lina.example.com`, зоны/логи `lina_*`.

Не использовать существующие VX env/pepper/DB/PM2 user; не выполнять pm2 restart/delete all, pm2 kill чужого daemon, apt upgrade, перезапуск PostgreSQL, перезапись default vhost/nginx.conf, удаление sites-enabled или общий certbot --nginx. Nginx reload — общий для сервиса, хотя конфигурация добавляется только LINA: на shared host нулевое влияние нельзя гарантировать без отдельного preflight и подтверждения. Установка системных пакетов также может затронуть shared services — нижеприведённую установку PostgreSQL/Nginx разрешать только на новом выделенном host либо после отдельной оценки. Никаких действий с VX House в этой подготовке не выполнено.

## Значения до реального запуска

Предоставить: IP/hostname Droplet и SSH admin user; Ubuntu version/CPU architecture; dedicated или shared host, существующие Node/PM2/Nginx/PostgreSQL, свободные ресурсы и порты; канонический HTTPS domain; DNS A/AAAA status и использование CDN/LB; email Certbot и согласие с условиями Let's Encrypt; private repository URL+точный commit либо согласованный source archive; DB location/version/port (рекомендуется local PostgreSQL 18; Stage 3 тестировался на 18), DB/role names; согласие на 3107 и /srv/lina; backup destination/retention и способ шифрования. Секреты передавать напрямую в password manager/env на сервере, не в чат.

GitHub repository текущей LINA: https://github.com/pdlpnk/parachat.online.git. Для deployment использовать подтверждённый полный commit SHA из отчёта Git-подготовки; не предполагать, что изменяемый main всегда указывает на проверенный release.

## Структура

```text
/srv/lina/                         OS home приложения, не чужой deploy user
  releases/<release-id>/           исходники, Linux dependencies и .next/standalone
  current -> releases/<release-id>
  shared/lina.env                 0600, вне release и Git
  runtime/node/                   Node 24 installation или ссылка на подходящий runtime
  tools/                          pnpm/PM2 вне dependencies продукта
  .pm2/                           только PM2 пользователя lina
  logs/                           только app logs LINA
  backups/                        root:root 0700, только LINA dump
/var/www/lina-acme/                Certbot webroot
/etc/nginx/sites-available/lina.conf
/etc/nginx/sites-enabled/lina.conf
/etc/letsencrypt/live/<LINA_DOMAIN>/
```

## Команды по порядку — ТОЛЬКО после подтверждения deployment

Все серверные shell-блоки — Bash. Использовать реальные значения вместо ALL_CAPS placeholders. При ошибке остановиться; не продолжать цепочку вручную. Это сценарий первого deployment, не скрипт для слепого повторного запуска поверх существующей production.

### 1. Read-only preflight (SSH admin на согласованном Ubuntu host)

```bash
set -euo pipefail
cat /etc/os-release
uname -m
free -h
df -h /srv
command -v node || true
command -v pnpm || true
command -v nginx || true
command -v psql || true
getent passwd lina || true
sudo ss -ltnp
sudo test ! -e /srv/lina
sudo test ! -e /etc/nginx/sites-available/lina.conf
sudo test ! -e /etc/nginx/sites-enabled/lina.conf
# Если установлен Nginx:
sudo nginx -t
# Если установлен PostgreSQL:
pg_lsclusters
sudo -u postgres psql -X -Atc "SELECT datname FROM pg_database WHERE datname='lina_prod'"
sudo -u postgres psql -X -Atc "SELECT rolname FROM pg_roles WHERE rolname='lina_app'"
```

Отсутствие Nginx/PG допустимо на новом host: соответствующие команды запускаются только после установки. При найденных lina user/path/DB/role или занятом 3107 остановиться и согласовать другое имя/порт, не переиспользовать неизвестное состояние. Проверить existing vhosts на конфликт server_name локально на сервере; не публиковать полный конфиг/секреты в чат. Не открывать 3107/5432 в DO Firewall; публично нужны 80/443 и согласованный SSH. Firewall не сбрасывать. DNS здесь не изменяется; для Certbot домен уже должен указывать на этот host, включая корректный AAAA.

### 2. Отдельный OS user и директории (admin)

```bash
sudo adduser --disabled-password --gecos '' --home /srv/lina lina
sudo chmod 0755 /srv/lina
sudo install -d -o lina -g lina -m 0750 /srv/lina/releases /srv/lina/runtime /srv/lina/tools /srv/lina/logs
sudo install -d -o lina -g lina -m 0700 /srv/lina/shared /srv/lina/.pm2
sudo install -d -o root -g root -m 0700 /srv/lina/backups
sudo install -d -o root -g root -m 0755 /var/www/lina-acme
```

### 3. Системные пакеты — только если отсутствуют, на выделенном host (admin)

Без общего upgrade. Пропустить уже установленные компоненты. На shared host сначала согласовать package/service effects.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl xz-utils openssl rsync git
# Только если Nginx отсутствует:
sudo apt-get install -y nginx
# Только если нет PostgreSQL: официальный PGDG, major 18.
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt-get update
sudo apt-get install -y postgresql-18 postgresql-client-18
```

Не устанавливать новый PG major поверх host с существующим cluster без отдельного плана. При уже существующем согласованном PostgreSQL использовать его отдельную DB, не менять общие listen_addresses/pg_hba.conf/timezone. Проверить local TCP password authentication к 127.0.0.1:5432; `trust` не включать. Если endpoint другой, синхронно изменить env и backup команды. Managed PG требует отдельного варианта TLS/CA и backup — не применять локальные sudo -u postgres команды к нему.

### 4. Node 24 / pnpm / PM2 отдельно от других приложений (OS user lina)

```bash
sudo -iu lina
set -euo pipefail
cd /srv/lina
# Если уже есть подходящий Node 24, только ссылка — никаких global upgrades.
if command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0] === 24 ? 0 : 1)'; then
  ln -s "$(dirname "$(dirname "$(readlink -f "$(command -v node)")")")" /srv/lina/runtime/node
else
  # Точный runtime, указанный в .node-version и проверенный Stage 3.
  LINA_NODE_VERSION=v24.19.0
  case "$(uname -m)" in
    x86_64) LINA_NODE_ARCH=x64 ;;
    aarch64) LINA_NODE_ARCH=arm64 ;;
    *) exit 1 ;;
  esac
  LINA_NODE_ARCHIVE="node-${LINA_NODE_VERSION}-linux-${LINA_NODE_ARCH}.tar.xz"
  cd /srv/lina/runtime
  curl -fSLO "https://nodejs.org/dist/${LINA_NODE_VERSION}/${LINA_NODE_ARCHIVE}"
  curl -fSLo SHASUMS256.txt "https://nodejs.org/dist/${LINA_NODE_VERSION}/SHASUMS256.txt"
  awk -v archive="$LINA_NODE_ARCHIVE" '$2 == archive' SHASUMS256.txt > lina-node.sha256
  test -s lina-node.sha256
  sha256sum -c lina-node.sha256
  tar -xf "$LINA_NODE_ARCHIVE"
  ln -s "node-${LINA_NODE_VERSION}-linux-${LINA_NODE_ARCH}" /srv/lina/runtime/node
fi
export PATH="/srv/lina/runtime/node/bin:/srv/lina/tools/bin:$PATH"
node --version
if ! command -v pnpm >/dev/null || [ "$(pnpm --version)" != '11.19.0' ]; then
  npm install --global --prefix /srv/lina/tools pnpm@11.19.0
fi
# PM2 installation is LINA-specific, not the existing global PM2 of other projects.
if [ ! -x /srv/lina/tools/bin/pm2 ]; then
  npm install --global --prefix /srv/lina/tools pm2@6
fi
pnpm --version
/srv/lina/tools/bin/pm2 --version
npm list --global --prefix /srv/lina/tools --depth=0 > /srv/lina/tools/installed-versions.txt
exit
```

`pm2@6` выбирает актуальный minor/patch этого major при первой установке; installed-versions.txt фиксирует фактический результат, повторно автоматически не обновлять. При выборе нового Node 24 patch перед запуском согласовать его и выполнить smoke. Node 24 поддерживает --env-file. Corepack activation и изменение глобальных Node/pnpm других проектов не требуются.

### 5. Доставить точный source release

Основной путь — GitHub. После подтверждения deployment, под OS user `lina` (Git должен быть установлен), создать новый release и проверить точный SHA:

```bash
sudo -iu lina
set -euo pipefail
LINA_RELEASE=stage3-20260909-01
LINA_COMMIT=FULL_APPROVED_COMMIT_SHA
[[ "$LINA_COMMIT" =~ ^[0-9a-f]{40}$ ]]
test ! -e "/srv/lina/releases/$LINA_RELEASE"
git clone --branch main --single-branch https://github.com/pdlpnk/parachat.online.git "/srv/lina/releases/$LINA_RELEASE"
cd "/srv/lina/releases/$LINA_RELEASE"
git checkout --detach "$LINA_COMMIT"
test "$(git rev-parse HEAD)" = "$LINA_COMMIT"
# Только первый deployment: current ещё не существует.
test ! -e /srv/lina/current
ln -s "/srv/lina/releases/$LINA_RELEASE" /srv/lina/current
exit
```

Для private repository использовать отдельный read-only deploy key/credential helper на сервере после подтверждения; не записывать token в URL, Git config или проект. При отказе authentication остановиться. Следующие шаги runbook одинаковы для Git и архива. Ни SSH, ни clone на сервер сейчас не выполняются.

Альтернативный путь — source archive, если GitHub недоступен. **Не выполнять оба варианта доставки.** Команды ниже на локальном Mac создают архив без .env, macOS dependencies, .git и локальных БД:

```bash
cd '/Users/roman/Documents/Codex Projects/Chat WEB'
tar --exclude='./.git' --exclude='./node_modules' --exclude='./.next' \
  --exclude='./.local-test' --exclude='./src/generated' --exclude='./.env*' \
  --exclude='./reference' --exclude='*.tsbuildinfo' --exclude='*.log' \
  -czf /private/tmp/lina-source.tar.gz .
# Env example excluded by wildcard: add it to delivery as a separate nonsecret file.
scp /private/tmp/lina-source.tar.gz .env.example.production SSH_ADMIN@SERVER_IP:/tmp/
```

На сервере (admin), release ID задаётся один раз:

```bash
LINA_RELEASE=stage3-20260909-01
sudo install -d -o lina -g lina -m 0750 "/srv/lina/releases/$LINA_RELEASE"
sudo -u lina tar -xzf /tmp/lina-source.tar.gz -C "/srv/lina/releases/$LINA_RELEASE"
sudo install -o lina -g lina -m 0644 /tmp/.env.example.production "/srv/lina/releases/$LINA_RELEASE/.env.example.production"
sudo -u lina ln -s "/srv/lina/releases/$LINA_RELEASE" /srv/lina/current
```

Не использовать этот tar для копирования production env/DB. Для следующих releases не строить поверх работающего current; rollback кода не откатывает schema автоматически.

### 6. Отдельные PostgreSQL role и DB (admin)

Сначала сгенерировать отдельный случайный DB password в password manager (например 32 random bytes → 64 hex). `\password` вводит его без shell history/SQL literal. Не использовать CLIENT_CREDENTIAL_PEPPER в качестве DB password.

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1
```

В psql:

```sql
CREATE ROLE lina_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\password lina_app
CREATE DATABASE lina_prod OWNER lina_app TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE lina_prod FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE lina_prod TO lina_app;
\connect lina_prod
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO lina_app;
\quit
```

Эта минимальная схема использует владельца БД и для migrate deploy, и для runtime; это не superuser. Отдельная migration role возможна позднее, сейчас архитектуру прав не расширяем. Никакие чужие DB/roles/privileges не меняются. На shared cluster всё равно разделяются ресурсы и superuser trust: полная изоляция требует отдельного host/cluster.

### 7. Секреты и production env (admin)

```bash
sudo install -o lina -g lina -m 0600 /srv/lina/current/.env.example.production /srv/lina/shared/lina.env
sudo -u lina nano /srv/lina/shared/lina.env
sudo stat -c '%a %U:%G %n' /srv/lina/shared/lina.env
```

Ввести реальный DATABASE_URL, точный HTTPS LINA_ORIGIN и pepper. Не показывать env через cat, pm2 env/jlist или process dumps. Если password не hex, URL-encode reserved characters. Никаких NEXT_PUBLIC_* secrets нет. Env не source-ить в shell PM2: Node читает файл через --env-file; так DB/pepper не сохраняются в PM2 dump как явно переданные env поля. env-файл, backup и OS account всё равно защищать.

Secret generation example — выполнить **один раз только при первом запуске**, сохранить вывод в password manager; не выполнять в журналируемом чате:

```bash
openssl rand -hex 32
```

Два независимых запуска: DB password и CLIENT_CREDENTIAL_PEPPER. **Pepper хранить навсегда**, вместе с зашифрованной резервной копией env и DB. Он используется для HMAC client credentials и AES bootstrap key derivation. Его смена делает существующие cookies неразрешимыми и bootstrap недействительным; встроенного recovery/rotation нет. Не менять на redeploy/restart/другом Node instance и не подменять pepper другого проекта. DB password можно менять только согласованно с DB role + env + restart; самопроизвольная смена ломает подключения, но не identity hashes. TLS keys/ACME state тоже backup; TLS certificate автоматически обновляется, это не identity secret. Canonical domain не секрет, но смена hostname лишает браузер прежних host-only cookies: не считать её обычной прозрачной ротацией.

### 8. Dependencies → generate → migration → build (OS user lina)

```bash
sudo -iu lina
set -euo pipefail
export PATH="/srv/lina/runtime/node/bin:/srv/lina/tools/bin:$PATH"
cd /srv/lina/current
# Build needs devDependencies (Prisma CLI, TypeScript). Do not install --prod only.
pnpm install --frozen-lockfile --prod=false
pnpm db:generate
pnpm db:validate
# Target check: prints hostname/DB name only, NEVER password/pepper.
node --env-file=/srv/lina/shared/lina.env --input-type=module -e '
  const u = new URL(process.env.DATABASE_URL);
  if (u.hostname !== "127.0.0.1" || (u.port || "5432") !== "5432" || u.pathname !== "/lina_prod" || u.username !== "lina_app") throw Error("Wrong LINA DB target");
  if (!/^[a-fA-F0-9]{64}$/.test(process.env.CLIENT_CREDENTIAL_PEPPER || "")) throw Error("Invalid pepper");
  const origin = process.env.LINA_ORIGIN;
  const site = new URL(origin);
  if (site.protocol !== "https:" || site.origin !== origin || site.hostname === "lina.example.com") throw Error("Invalid production origin");
  console.log("Target checked:", u.hostname, u.pathname);
'
# PRODUCTION MUTATION: only after separate explicit approval and backup if DB is nonempty.
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js migrate deploy
pnpm build
# Already done inside pnpm build. Only needed if next build was run directly:
# node scripts/prepare-standalone.mjs
test -s .next/standalone/server.js
test -d .next/standalone/.next/static
if [ -d public ]; then test -d .next/standalone/public; fi
exit
```

Не выполнять `test:db`/HTTP fixture scripts против lina_prod: они предназначены для disposable DB. `migrate deploy` требует подтверждения независимо от наличия команд в runbook; сейчас не выполнялся. Секреты не нужны для build/generate; env хранится вне release, чтобы не попасть в traced output.

### 9. PM2 start + save (OS user lina), затем startup (admin)

```bash
sudo -iu lina
set -euo pipefail
export PATH="/srv/lina/runtime/node/bin:/srv/lina/tools/bin:$PATH"
export PM2_HOME=/srv/lina/.pm2
cd /srv/lina/current
/srv/lina/tools/bin/pm2 start deploy/ecosystem.config.json --only lina
curl -fsS http://127.0.0.1:3107/api/health/live
curl -fsS http://127.0.0.1:3107/api/health
/srv/lina/tools/bin/pm2 save
exit
```

Admin, отдельный service только для пользователя lina:

```bash
sudo env PATH=/srv/lina/runtime/node/bin:/srv/lina/tools/bin:/usr/bin:/bin PM2_HOME=/srv/lina/.pm2 \
  /srv/lina/tools/bin/pm2 startup systemd -u lina --hp /srv/lina --service-name pm2-lina
sudo systemctl status pm2-lina --no-pager
sudo systemctl cat pm2-lina
sudo ss -ltnp 'sport = :3107'
```

Проверить loopback bind и отсутствие других apps в `/srv/lina/.pm2`. `pm2 save` без startup не обеспечивает reboot recovery. Watch/cluster не включены. Для последующего restart только LINA: под OS user lina с тем же PATH/PM2_HOME выполнить `pm2 restart /srv/lina/current/deploy/ecosystem.config.json --only lina`, затем health и `pm2 save`. Предел 768M — защитный restart threshold, не гарантия реального consumption и не hard OS cap. Настроить retention для `/srv/lina/logs` (например отдельный logrotate stanza), не устанавливать глобальный PM2 module для чужого daemon.

### 10. Nginx HTTP bootstrap и Certbot (admin)

В обоих nginx templates заменить **все** `lina.example.com` на согласованный domain. Пример использует прямой Internet → Nginx. При Cloudflare/DO LB IP limits требуют отдельной trusted real-IP настройки; не доверять всем X-Forwarded-For и не применять template как готовую CDN-конфигурацию.

```bash
LINA_DOMAIN='YOUR_LINA_DOMAIN'
LINA_CERT_EMAIL='YOUR_CERTBOT_EMAIL'
# Replace locally in the LINA file only; domain must be a validated DNS hostname.
sed "s/lina\.example\.com/$LINA_DOMAIN/g" /srv/lina/current/deploy/nginx-lina-http.conf.example > /tmp/lina-http.conf
sudo install -o root -g root -m 0644 /tmp/lina-http.conf /etc/nginx/sites-available/lina.conf
sudo ln -s /etc/nginx/sites-available/lina.conf /etc/nginx/sites-enabled/lina.conf
sudo nginx -t
sudo systemctl reload nginx
```

До сертификата приложение через HTTP не обслуживается (503), ACME challenge доступен. Не выключать существующий Nginx ради standalone Certbot.

Если Certbot уже установлен, использовать существующую установку; не переустанавливать/не удалять certbot другого проекта. Если отсутствует на новом выделенном Ubuntu host — официальный snap путь:

```bash
# ONLY if absent; skip these installation commands when already installed.
sudo apt-get install -y snapd
sudo snap install --classic certbot
# If /usr/local/bin/certbot is absent:
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
```

После отдельно подтверждённых DNS/80 reachability и условий Let's Encrypt:

```bash
sudo certbot certonly --webroot -w /var/www/lina-acme \
  --cert-name "$LINA_DOMAIN" -d "$LINA_DOMAIN" --email "$LINA_CERT_EMAIL" --agree-tos --non-interactive
sed "s/lina\.example\.com/$LINA_DOMAIN/g" /srv/lina/current/deploy/nginx-lina.conf.example > /tmp/lina-https.conf
sudo install -o root -g root -m 0644 /tmp/lina-https.conf /etc/nginx/sites-available/lina.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --cert-name "$LINA_DOMAIN" --dry-run
```

Renewal hook только этой lineage (после замены домена); Nginx reload после обновления сертификата:

```bash
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/lina-reload-nginx >/dev/null <<EOF_HOOK
#!/bin/sh
if [ "\$RENEWED_LINEAGE" = "/etc/letsencrypt/live/$LINA_DOMAIN" ]; then
  /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
fi
EOF_HOOK
sudo chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/lina-reload-nginx
systemctl list-timers --all | grep -E 'certbot|snap.certbot' || true
```

Если timer отсутствует, сначала определить установленный Certbot method и настроить его штатный timer; не считать HTTPS renewal готовым. Не запускать `certbot renew` для всех чужих lineages ради LINA. HTTP redirect остаётся 308, ACME location не redirect-ится. Нет WebSocket config. Proxy только loopback; Origin не подделывается; 64k nginx body limit соответствует 65,536 bytes app send limit. Start+bootstrap вместе ограничены 10 POST/min/IP + burst10, send — 60 POST/min/IP + burst15, общий limit 20req/s + burst40, active connections30/IP. GET polling не расходует POST ceiling. NAT-группы могут разделять IP limits; это starting policy с необходимостью наблюдения, не защита от распределённого DDoS. Edge может ограничить retry, даже когда приложение уже сохранило сообщение: повтор после Retry-After использует тот же key.

### 11. Backup PostgreSQL и secrets (admin)

Backup до любых следующих production migrations и регулярно по отдельно согласованному расписанию. pg_dump той же major версии, что сервер (здесь 18), только одна LINA DB. Не использовать pg_dumpall чужого cluster.

```bash
sudo bash <<'BACKUP'
set -euo pipefail
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="/srv/lina/backups/lina_prod-$stamp.dump"
sudo -u postgres /usr/lib/postgresql/18/bin/pg_dump -Fc --no-owner --no-acl --dbname=lina_prod > "$file"
/usr/lib/postgresql/18/bin/pg_restore --list "$file" > "$file.list"
sha256sum "$file" > "$file.sha256"
BACKUP
```

Exit 0 и `pg_restore --list` проверяют читаемость archive, но не заменяют test restore. Для проверки создать **новую явно одноразовую** DB, никогда не restore --clean в lina_prod:

```bash
# Replace RESTORE_CHECK_DB with a unique, explicitly disposable name first.
sudo -u postgres createdb --owner=lina_app --template=template0 RESTORE_CHECK_DB
sudo bash -c 'sudo -u postgres /usr/lib/postgresql/18/bin/pg_restore --no-owner --no-acl --exit-on-error --role=lina_app --dbname=RESTORE_CHECK_DB < /srv/lina/backups/CHOSEN_DUMP.dump'
```

Root открывает dump-файл, соединение использует OS postgres и штатный peer auth. Проверить table counts/constraints в restore DB; её удаление — отдельное осознанное действие. Backup хранит hash credentials и сообщения; plaintext dump не отправлять внешнему хранилищу. До запуска согласовать шифрование/off-host destination и retention. Зашифрованно сохранить отдельно `/srv/lina/shared/lina.env` (pepper + DB credentials) и ACME/certificate private state; backup DB без pepper недостаточен для продолжения существующих player sessions. Пароль роли сохраняется в password manager: dump --no-owner/--no-acl не включает role password. Здесь backup job/cron и удаление старых backup не создавались.

## Полный production smoke checklist

- [ ] `curl -fsS https://DOMAIN/api/health/live`: 200 (процесс).
- [ ] `curl -fsS https://DOMAIN/api/health`: 200 (DB connectivity); readiness не заменяет проверку applied migrations.
- [ ] `curl -I http://DOMAIN/`: 308 на точный HTTPS domain.
- [ ] Локальный `ss`: Node слушает только 127.0.0.1:3107; снаружи app/DB порты закрыты.
- [ ] TLS chain валиден, renewal dry-run PASS, timer/hook проверены.
- [ ] В чистом browser profile/incognito HTTPS anonymous landing без старого cookie.
- [ ] Start с тестовым именем создаёт один LI ID, permanent Conversation и один welcome.
- [ ] DevTools Network Set-Cookie: __Host-lina_client, HttpOnly, Secure, SameSite=Lax, Path=/, без Domain. Не копировать значение cookie в отчёт; bootstrap очищен после Start.
- [ ] Enter/button send настоящего текста → один USER bubble; body/response не содержат внутренних UUID/credential data.
- [ ] Reload сохраняет LI ID, текст и порядок истории; welcome не дублируется.
- [ ] Shift+Enter сохраняет multiline; intentional одинаковый текст дважды создаёт два сообщения.
- [ ] Две вкладки: сообщение из одной видно в другой через polling, без дублей.
- [ ] Read marker не регрессирует; USER не даёт client unread; выше истории scroll не прыгает.
- [ ] Send/read/poll responses no-store; чужой Origin отвергается. Проверку сделать вручную в согласованном объёме, не production load test.
- [ ] `/dev/messenger` возвращает 404 в production.
- [ ] Mobile: 320/390/430px, реальная клавиатура, textarea growth, send visible, long multiline, scroll bottom и отсутствие horizontal overflow.
- [ ] После адресного `pm2 restart ... --only lina`: health, прежний LI и история сохраняются. Reboot test — только в отдельное окно с подтверждением, особенно на shared host.
- [ ] Snapshot/backup выполнен, restore проверен в disposable DB, pepper/env сохранены отдельно в зашифрованном виде.
- [ ] Если shared host: до/после сравнить здоровье согласованных VX/других проектов; их configs/processes/DB не изменены.

Production smoke оставляет реальные тестовые сообщения в LINA DB: согласовать тестовую identity, не запускать destructive fixture suites. Проверка ответа OPERATOR требует будущего Admin или отдельно согласованного fixture; новая Admin feature здесь не добавляется.

## Источники, сверенные при подготовке

- Next standalone: локальный `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` и фактический generated server.js.
- [PM2 application declaration](https://pm2.keymetrics.io/docs/usage/application-declaration/), [startup/save](https://pm2.keymetrics.io/docs/usage/startup/).
- [Nginx request limits](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html), [connection limits](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html), [map](https://nginx.org/en/docs/http/ngx_http_map_module.html).
- [Certbot install](https://certbot.eff.org/instructions?ws=nginx&os=snap), [webroot/renewal](https://eff-certbot.readthedocs.io/en/latest/using.html).
- [PostgreSQL Ubuntu packages](https://www.postgresql.org/download/linux/ubuntu/), [Node official downloads](https://nodejs.org/en/download).

После подготовки остановиться. Реальный deployment, DNS, production DB/migration, выдача сертификата и системные изменения требуют отдельного явного подтверждения.
