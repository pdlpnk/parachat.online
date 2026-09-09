# LINA — итоговый отчёт Stage 3

Дата: 2026-09-09. Stage 3 реализован и проверен. Stage 4 не начат. Все действия выполнялись локально; production deploy отсутствует. Текущий контракт: [LINA_PLAYER_MESSENGER.md](LINA_PLAYER_MESSENGER.md).

1. **Initial state.** Существующий Next.js 16.3.4 / React 19.2.8 / Prisma 7.10.0 проект с завершёнными Foundation, Player Identity и Messenger UI. PostgreSQL уже обеспечивает sequence, ownership, idempotency uniqueness и read-marker constraints. Git main без первого commit; исходные файлы untracked.

2. **Files reviewed.** README, AGENTS, локальные Next guides server/client components и Route Handlers; LINA_FOUNDATION.md / REPORT, LINA_PLAYER_IDENTITY.md / REPORT, LINA_MESSENGER_UI_REPORT.md; schema и обе старые миграции; env/db/identity/health; page, NameForm, Messenger, preview, CSS; unit/DB/HTTP tests, package scripts. Исторические reference-файлы не использовались как текущий контракт.

3. **Files created.** `src/lib/messages.ts`, `src/lib/polling.ts`, `src/server/database-config.ts`, `src/server/messages/dto.ts`, `src/server/messages/service.ts`, `src/server/messages/http.ts`, `src/app/api/player/messages/route.ts`, `src/app/api/player/read/route.ts`, `src/components/player-messenger.tsx`, `prisma/migrations/20260909000000_player_send_rate_index/migration.sql`, `tests/unit/messages.test.ts`, `tests/database/messages.test.ts`, `tests/http/messages-smoke.mjs`, `docs/LINA_PLAYER_MESSENGER.md`, этот отчёт. В ignored `.local-test` сохранены QA launcher, fixtures, screenshots и результаты.

4. **Files modified.** `README.md`, `prisma/schema.prisma`, `src/server/db.ts`, `src/server/identity/service.ts` (только player history/DTO), `src/app/page.tsx`, `src/app/globals.css`, `src/components/messenger.tsx`, `tests/database/invariants.test.ts`, `tests/database/player.test.ts` (UTC connections), `tests/http/player-smoke.mjs` (актуальный текст результата). Next автоматически обновляет `next-env.d.ts`. Зависимости/lockfile не менялись в Stage 3.

5. **Database changes.** Один индекс Message; новых моделей/колонок/очередей нет. Время сессий соединений приложения явно UTC; timezone кластера и старые данные не изменены.

6. **Migration details.** `20260909000000_player_send_rate_index`: индекс `Message_conversationId_authorType_createdAt_idx` на `(conversationId, authorType, createdAt)`, соответствует COUNT по conversation + USER + createdAt >= now−60s. Применён migrate deploy; обе прежние applied migrations побайтно сохранены. db push не использовался.

7. **Player send flow.** Cookie → HMAC credential lookup → permanent owner Conversation → нормализованный USER → транзакционный commit → безопасный DTO → merge в UI. Автор назначается только сервером.

8. **Send endpoint contract.** `POST /api/player/messages`; Content-Type application/json; body строго `{text}`; обязательный header `Idempotency-Key`. Новый send и replay возвращают 200 `{message}`. Ошибки 400/401/403/409/413/415/429/503 с безопасным RU текстом.

9. **Message validation.** 1–5000 Unicode scalar values после LF/NFC/trim; внутренние переносы/отступы, multilingual и emoji сохраняются. Пустые/control-only/lone-surrogate/oversize строки отклоняются. HTML-подобный текст остаётся plaintext и экранируется React.

10. **Idempotency implementation.** Canonical lowercase UUID v4 в header. Та же пара conversation+key и нормализованный текст возвращает тот же DTO; иной текст — 409. Повтор не меняет timestamps; одинаковый текст с другим key создаёт отдельное сообщение.

11. **Send transaction.** Credential share lock → Conversation FOR UPDATE → проверка expiry после ожидания → replay → rate COUNT → insert → first/last/closed update. Ошибка откатывает всё. Блокировки PostgreSQL общие для процессов; process-local correctness locks отсутствуют.

12. **Message.sequence behavior.** Существующий BEFORE INSERT trigger выделяет следующий sequence; клиент не передаёт его. Параллельные новые sends получают уникальные позиции; неуспешная транзакция откатывает counter. UI сортирует ASC.

13. **firstUserMessageAt behavior.** COALESCE устанавливает дату ровно первого сохранённого USER. Последующие USER, SYSTEM, poll, read и replay дату не переписывают. Проверено при параллельных первых sends.

14. **closedAt auto-reopen behavior.** Только новый USER устанавливает NULL. Повтор уже сохранённого сообщения не открывает закрытый разговор; poll/read/SYSTEM также не открывают.

15. **lastMessageAt behavior.** Новый USER устанавливает реальный persisted createdAt. Время берётся из DB clock после row lock и не регрессирует относительно предыдущего lastMessageAt. Replay/read/poll его не меняют; OPERATOR send остаётся следующим этапом.

16. **Initial history behavior.** SSR выбирает последние сообщения по sequence DESC, затем разворачивает ASC. После reload реальные USER/OPERATOR/SYSTEM остаются в истории. Не выбираются первые 100 вместо последних.

17. **History limit.** Initial window — 100. Older-history/infinite scroll отсутствует. В открытой вкладке последующие сообщения накапливаются; reload снова ограничивает историю последними 100.

18. **Poll endpoint contract.** `GET /api/player/messages?after=N`; только один корректный integer cursor, без conversation/client IDs. Ответ `{messages,hasMore,readSequence,unreadCount}`; только sequence > N, ASC, не более 100.

19. **Poll interval.** 5 секунд после завершения цикла; первый poll сразу. Контролируемый setTimeout вместо setInterval.

20. **Cursor/batch/catch-up behavior.** До 10 последовательных batches за цикл, затем продолжение через 250ms при hasMore. Не продвигающийся cursor вызывает ошибку. 251 сообщение выгружено без потерь. Ответ собственной отправки не продвигает poll cursor и не пропускает interleaved сообщения.

21. **Hidden-tab behavior.** document.hidden приостанавливает polling и abort-ит poll/read; visibility/online возобновляет сразу. Lifecycle pause/resume/late-response покрыт unit-тестом; OS background throttling всех браузеров отдельно не аттестован.

22. **Abort/no-overlap behavior.** Один активный poll; AbortController на lifecycle и timeout 10s на fetch. Unmount не обновляет state поздними ответами. Catch-up последовательный; test подтверждает max concurrency = 1.

23. **Client merge behavior.** Canonical sequence, deduplication, ASC и стабильные React keys. SSR/poll/send overlaps не создают дубли; пустой или повторный batch сохраняет массив.

24. **Composer behavior.** Живой multiline textarea, Enter/send-button, Shift+Enter newline, IME guard, валидация, синхронный in-flight guard и возврат фокуса после отправки. Attachment disabled. Высота до 136px, на низком экране до 25dvh с минимумом 42px.

25. **Pending/error/retry behavior.** Non-optimistic: текст виден до подтверждения, controls disabled в полёте. Ошибка сохраняет text+key; Retry использует исходный logical attempt. Изменённый draft не теряется при retry старого текста. Failed snapshot показывается при отличии от draft. Reload/tab close очищает локальный unsent state; offline queue не реализована.

26. **Player read marker.** Используется прежняя ClientConversationRead. Upsert GREATEST атомарен между вкладками/процессами; повтор/движение назад не меняет lastReadAt. Conversation timestamps не затрагиваются.

27. **Read endpoint/policy.** `POST /api/player/read {sequence}`; sequence должен существовать в own Conversation. UI debounce 300ms, visible и ≤80px от нижней границы. Acknowledge только SSR/poll cursor, а не потенциально перескочивший send response. Последнее initial-window сообщение отмечает прочитанным и старый префикс — явная MVP policy.

28. **Client unread semantics.** Только SYSTEM/OPERATOR после read marker; USER не увеличивает unread. В браузере при scrollTop=0 появился «Новые сообщения · 1 ↓»; переход вниз вернул bottomGap=0 и убрал индикатор. Другая вкладка вправе продвинуть общий marker.

29. **Scroll behavior.** Initial/own successful send — вниз; incoming при near-bottom — вниз; выше истории позиция сохраняется, появляется кнопка. ResizeObserver и учёт изменений геометрии удерживают anchored bottom при изменении размеров/composer. Для resize проверяется settled layout, а не промежуточный frame.

30. **Timestamp/date behavior.** UTC ISO из сохранённой строки → browser-local HH:mm после hydration, без фальшивых Today/Yesterday. Дневные separators опущены. Обнаруженная проблема offset установленного Prisma PG adapter устранена UTC session options; реальная близость createdAt к clock проверяется тестом. Исторические локальные offset-ошибки автоматически не исправлялись.

31. **SYSTEM handling.** Существующий structured resolver сохранён; welcome не дублируется. Неизвестный system key → нейтральное «Системное сообщение.». Raw key/params в DTO не выдаются. SYSTEM не активирует Conversation.

32. **OPERATOR rendering readiness.** Реальные OPERATOR fixtures из PostgreSQL появляются через polling, получают существующий левый bubble и локальное время. Только test DB fixtures; Admin send/API не добавлен.

33. **Origin/CSRF.** Используется существующий Stage 2 exact Origin + Sec-Fetch-Site policy. Foreign/missing/null/cross-site POST отклонён HTTP smoke. Cookie-auth GET не меняет read state и возвращает no-store.

34. **Rate limiting.** 30 committed USER / 60s / permanent Client; COUNT+insert под Conversation lock. DB-backed, общая для процессов. Committed replay разрешён даже на ceiling; другой клиент независим. Нет limiter event-table; ingress/IP limits всё ещё нужны до deploy.

35. **Body-size limits.** Потоковое чтение с ограничением до parse: send 65,536 bytes, read 512 bytes; 413 при превышении. 5000 JSON-escaped astral символов помещаются. Дополнительные authoritative JSON поля отвергаются.

36. **Authentication failure behavior.** Missing/invalid/unknown/revoked/expired — 401 без нового Client. UI останавливает poll/send, показывает «Сессия завершена» и refresh; существующий landing/bootstrap flow выполняет новый осознанный Start при необходимости. Никакой silent identity recreation.

37. **Multiple-tab behavior.** Проверены обе стороны: send во второй → ровно один bubble в первой, затем наоборот. Общая credential/Conversation, разные intentional keys создают разные сообщения; read marker общий и монотонный. BroadcastChannel не добавлен.

38. **Multiple-process correctness.** Два standalone Node процесса 55440/55442 прошли HTTP send/replay/concurrent sequence/activation/read/rate. Независимые Prisma pools также проверены DB-тестами. Invariants обеспечены PostgreSQL.

39. **Security review.** Проверены ownership, server-assigned USER, запрет клиентских IDs/author/sequence/timestamps, safe DTO/errors, React escaping, HMAC-only credential lookup, отсутствие credentials/params/internal IDs в выдаче, no-store и Origin. Из 17 сохранённых backend baseline-файлов 14 побайтно прежние; изменены только db connection config, history DTO service и schema index. Crypto/cookies/bootstrap/start routes/health/LI/emoji/старые migrations сохранены.

40. **Client-exposed DTO fields.** Message: `sequence`, `authorType`, `text`, `createdAt`. Poll metadata: `hasMore`, `readSequence`, `unreadCount`. Нет message/client/conversation/admin UUID, idempotencyKey, systemParams, hashes, cookie или pepper.

41. **Unit tests added/results.** Добавлены 8 tests: validation/NFC/multiline/plaintext, Unicode/empty/control limits, key/cursor, merge, safe DTO/time, poll catch-up/no-overlap/pause/late results, loop guard, UTC options. Все 23/23 unit tests прошли, включая прежние 15.

42. **DB tests added/results.** Добавлены 22 messaging tests. Итог 40/40 с прежними 18: persistence/authors/activation/timestamps/replay/conflict/concurrency/rollback/reopen/isolation/read/unread/burst/rate/Unicode/session. Финальный прогон на отдельной `lina_test_stage3_verify`, ручная БД не очищалась.

43. **HTTP smoke results.** Прежний player smoke PASS. Новый messages smoke PASS: 104 ответа проверены, два production-mode локальных процесса, авторизация/send/reload/replay/invalid keys/text/body/Origin/cursors/read/rate/revocation/DTO/no-store. Все временные HTTP процессы остановлены.

44. **Browser QA results.** PASS: anonymous → Start → welcome → Enter → bubble → reload → persisted bubble; Shift+Enter; intentional identical twice; 5000 emoji accepted, 5001 rejected; DB-trigger failure → preserved draft → Retry → один bubble; две вкладки; OPERATOR polling; scroll/new-message/read; dev preview. Финальный браузерный console error/warn log пуст. Offline/packet loss не эмулировались на сетевом уровне; серверный failure/retry и backend lost-response replay проверены отдельно.

45. **Responsive viewport results.** Проверены 320×568, 360×800, 390×844, 414×896, 430×932, 1440×900, 1440×500, 844×390 landscape, 320×240 stress с многострочным draft. Горизонтального overflow нет, send доступен, composer внутри viewport, история имеет ненулевую высоту. Stress textarea 60px, history 86px. На settled 1440×500 и 390×844 bottomGap=0. PNG в `.local-test/stage3-screenshots`; desktop capture ограничен видимой областью browser surface, DOM-метрики проверены для полного viewport. Физическая мобильная клавиатура не проверялась.

46. **lint.** `eslint . --max-warnings 0` PASS на финальном коде.

47. **typecheck.** `next typegen` + `tsc --noEmit` PASS на финальном коде.

48. **Prisma validate/generate.** Оба PASS, Prisma Client 7.10.0 сгенерирован. Нет upgrade зависимостей.

49. **migrate deploy result.** PASS в disposable Stage 3/verification DB и локальной manual DB `lina_test`; новый index applied, старые migrations не редактировались. Новые production connections не создавались.

50. **Production build.** `next build` + `scripts/prepare-standalone.mjs` PASS; Prisma generate выполнен. Production-mode standalone использован исключительно для локальных smoke/browser tests. Deployment отсутствует.

51. **Exact git status.** main, no initial commit/HEAD. Все 154 файла untracked (до Stage 3 — 139); staged/committed изменений нет, commit/push не выполнялись. Точный compact status приведён ниже. Обычный git diff пуст из-за отсутствия tracked baseline, а не из-за отсутствия работы.

52. **Concise diff summary.** Два новых API routes; transactional messaging/read/poll service и безопасный DTO; shared text/merge/poller helpers; live controller на прежнем дизайне; latest-100 SSR; UTC DB session fix; один rate index; 8 unit + 22 DB tests и двухпроцессный HTTP smoke; README/contract/report.

53. **Что намеренно НЕ реализовано.** Stage 4, Admin Login/Messenger/send/list, tags, attachments, SSE/WebSocket, message edit/delete, older-history pagination, offline queue, recovery/presence, production deploy.

54. **Risks / limitations.** Draft/retry state исчезает при reload/tab close; долгоживущая вкладка накапливает сообщения; read policy подтверждает доставленный префикс у нижней границы, не физическое прочтение. Физическая клавиатура и все варианты OS suspension не аттестованы. Старые локальные timestamps могли быть записаны с offset-ошибкой до UTC fix, backfill не выполнялся. Полноценные ingress limits и production readiness относятся к будущему отдельному этапу. Текущая dev-сессия живёт пока работает локальная машина/процесс.

55. **Exact localhost URL.** http://localhost:55443 — финальная LINA с локальной PostgreSQL, сервер оставлен запущенным. Использовать именно localhost: Origin привязан к нему.

56. **Exact dev preview URL.** http://localhost:55443/dev/messenger — render-only fixtures с disabled composer; в production 404.

57. **Готовность к Stage 4.** Player-side foundation готова для отдельного следующего задания. Stage 4 не начат и не выполняется автоматически. Stage 3 завершён, сервер оставлен для ручной проверки.

## Exact compact Git status

```text
?? .env.example
?? .gitignore
?? .node-version
?? .npmrc
?? AGENTS.md
?? CHATGPT_PROJECT_CONTEXT.md
?? CLAUDE.md
?? MASTER_HANDOFF.md
?? README.md
?? docs/
?? eslint.config.mjs
?? manifest.json
?? next-env.d.ts
?? next.config.ts
?? package.json
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? prisma.config.ts
?? prisma/
?? reference/
?? scripts/
?? src/
?? tests/
?? tsconfig.json
```
