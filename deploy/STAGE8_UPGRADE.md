# Stage 8 — Meta Pixel / conversion tracking

Only LINA: `/srv/lina`, PM2 `lina`, existing `lina_prod`, HTTPS `parachat.online`.
No schema changes or migrations. No new secrets. Other applications and Nginx vhosts are outside this deployment.

## Behavior

- Optional `NEXT_PUBLIC_META_PIXEL_ID`. Empty/invalid: no Pixel, no consent UI, no Meta network requests.
- Build-time public variable, inlined by Next.js. Restarting PM2 alone cannot change it.
- Explicit marketing consent, separate from Start; five languages. Refusal does not block chat.
- Choice is stored in `lina-marketing-consent-v1`; storage events propagate revocation across tabs.
- On withdrawal: revoke Meta consent, discard queued commands, remove only `_fbp` / `_fbc`, reload to unload vendor code.
  If browser storage cannot be written, current-document refusal takes priority and reload is avoided to prevent restoring a stale grant.
- Pixel is mounted only on Player `/`; `/admin`, API, health and dev routes are excluded.
- PageView once per document/route visit after consent. React rerenders, Strict Mode and Start's `router.refresh()` do not add a second PageView. A real reload is a new page visit.
- Lead receipt returned only by the transaction creating a new Client + Conversation + welcome.
- Contact receipt returned only by the transaction saving the first USER message (including attachment-only); Conversation lock and `firstUserMessageAt` decide eligibility.
- Retries, existing identities, polling and history never return another receipt. No retrospective conversion backlog after later consent.
- Event parameters: `content_name=LINA Chat`, `content_category=Chat`, lowercase locale. No name, LI ID, credential, message content or contact details.
- Opaque random UUID `eventId` is passed as Meta `eventID`. For future CAPI, persist this same receipt transactionally and reuse its ID. CAPI/queue/secrets are not implemented here.

Browser delivery is best effort. Lost responses, blocked scripts, closed tabs or missing consent can lose conversions. The server guarantees fresh eligibility rather than exactly-once delivery to Meta. IDs are not persisted for replay in this stage.
Automatic configuration is disabled in the code; do not enable automatic advanced matching or automatic events in Events Manager without a separate privacy review.

## Deployment without Pixel ID

Run under the owner of the existing PM2 daemon. Substitute the reviewed full Stage 8 SHA.

```bash
set -euo pipefail
LINA_SHA='REVIEWED_STAGE8_COMMIT_SHA'
LINA_RELEASE="/srv/lina/releases/$LINA_SHA"
LINA_PREVIOUS="$(readlink -f /srv/lina/current)"
curl -fsS http://127.0.0.1:3107/api/health
test -L /srv/lina/current
test -r /srv/lina/shared/lina.env
test ! -e "$LINA_RELEASE"
git clone --no-checkout https://github.com/pdlpnk/parachat.online.git "$LINA_RELEASE"
cd "$LINA_RELEASE"
git checkout --detach "$LINA_SHA"
test "$(git rev-parse HEAD)" = "$LINA_SHA"
pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js generate
node --env-file=/srv/lina/shared/lina.env --input-type=module -e 'import {spawnSync} from "node:child_process"; const r=spawnSync("pnpm",["build"],{env:process.env,stdio:"inherit"});process.exit(r.status??1);'
test -f .next/standalone/server.js
test -d .next/standalone/.next/static
node --env-file=/srv/lina/shared/lina.env node_modules/prisma/build/index.js migrate status
```

All eight existing migrations must already be applied. Do not run migrations/reset/db push for this update.

```bash
umask 077
install -d -m 0700 /srv/lina/backups
LINA_BACKUP="/srv/lina/backups/pre-stage8-$(date -u +%Y%m%dT%H%M%SZ)"
sha256sum /srv/lina/shared/lina.env > "$LINA_BACKUP.env-checksum"
printf '%s\n' "$LINA_PREVIOUS" > "$LINA_BACKUP.previous-release"
pm2 stop lina
if ! (sudo -u postgres pg_dump -Fc --dbname=lina_prod > "$LINA_BACKUP.dump" && sudo -u postgres pg_restore --list < "$LINA_BACKUP.dump" >/dev/null && tar -C /srv/lina/shared -czf "$LINA_BACKUP.uploads.tar.gz" uploads); then
  pm2 restart lina --update-env
  exit 1
fi
test ! -e /srv/lina/current.stage8-next
ln -s "$LINA_RELEASE" /srv/lina/current.stage8-next
mv -Tf /srv/lina/current.stage8-next /srv/lina/current
pm2 restart lina --update-env
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:3107/api/health/live
curl -fsS http://127.0.0.1:3107/api/health
curl -fsS https://parachat.online/api/health
sha256sum --status -c "$LINA_BACKUP.env-checksum"
pm2 save
```

Keep the previous release and backups. If app health fails, this migration-free release may be reverted by atomically switching `current` back to `$LINA_PREVIOUS` and restarting only `lina`. No DB restore is required for an application rollback; never restore over new messages automatically.

## After receiving a real Pixel ID

1. Set the real numeric `NEXT_PUBLIC_META_PIXEL_ID` in `/srv/lina/shared/lina.env` using an editor. It is public, not a secret. Never add a CAPI token to `NEXT_PUBLIC_*`.
2. Prepare a fresh release/build directory from the reviewed commit (do not overwrite the running build); repeat the build above with `--env-file`, then backup, switch and restart only `lina`.
3. In Events Manager, keep automatic events/advanced matching disabled and use **Test Events** with the real Pixel. This release has not been verified against an actual Meta account.
4. Without consent/refusal: no `connect.facebook.net` / `facebook.com/tr` requests. Grant: one PageView; new chat: Lead; first USER message: Contact. Check event parameters and matching opaque event ID.
5. Error/retry/reload/existing Player/later messages: no new Lead/Contact. Reload can send PageView with existing consent.
6. Revoke, reload and test a second tab: no further tracking; chat and Player cookie continue working.
7. Admin/API/health/dev: no Pixel. Test RU/EN/TR/AZ/FA, all themes/fonts, 320–430px, FA RTL and attachments.

Until those real-ID checks pass, report “prepared / disabled”, not “fully verified in Meta”.
