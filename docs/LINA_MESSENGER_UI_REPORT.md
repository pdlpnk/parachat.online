# LINA Stage 2.5 — Messenger UI/UX

8 сентября 2026. Репозиторий Chat WEB. Этап касается представления, не Stage 3 functionality.

## 1. Предыдущий UI

Существующий экран реально осмотрен в браузере до изменений: собственное имя/emoji клиента в header,
welcome как техническая плашка, пустая белая история и footer без composer. Собеседник и назначение чата
были непонятны. Изучены page/styles/components, Player DTO, resolver, Stage 2 architecture/report.

## 2. UX решения

Header представляет LINA и персонального менеджера. LI ID остаётся secondary. История имеет самостоятельную
поверхность, разговорные bubbles и видимую нижнюю границу в виде composer. Нет выдуманного online status.
Welcome объясняет личный чат в будущем времени, поскольку отправка пока недоступна.

## 3. Files modified/created

Созданы src/components/brand-mark.tsx, src/components/messenger.tsx,
src/app/dev/messenger/page.tsx и этот docs/LINA_MESSENGER_UI_REPORT.md.
Изменены src/app/page.tsx, src/app/globals.css, src/components/name-form.tsx, src/lib/player.ts (только welcome copy),
tests/unit/player.test.ts (ожидаемый copy), tests/http/player-smoke.mjs (production preview exclusion),
next.config.ts (devIndicators:false) и README.md (ссылка на отчёт).
Next dev автоматически создал AGENTS.md/CLAUDE.md и регенерировал next-env.d.ts; generator проверен в
node_modules/next/dist/server/lib/generate-agent-files.js. Эти файлы не удалялись. Локальные Next guides для
devIndicators/notFound прочитаны при финальной проверке после получения пользовательских AGENTS instructions.

## 4. Desktop structure

Viewport shell 100dvh с внешними отступами 28px; центральный Messenger до 1040px, полноценная высота,
тонкая граница, небольшая тень, радиус 20px. Внутри header → history → composer. Bubble ограничен 560px.

## 5. Mobile structure

При ширине ≤640px — fullscreen, без внешней карточки/радиуса/тени. Safe-area top/bottom и горизонтальные
safe-area отступы. Compact header, единственный основной scroll owner — history, composer flex:none.

## 6. Header

Временный typographic L mark средствами UI, LINA, «Персональный менеджер». Нет client emoji в роли менеджера,
фото, выдуманной presence или realtime online badge. Mark легко заменить позже.

## 7. LI ID

Справа, под «Ваш ID», небольшой monospace secondary text. Это обычный текст; не recovery/auth button.
DisplayName не занимает место в header и не может вытеснить LI или composer.

## 8. SYSTEM bubble

Белый conversational welcome с eyebrow «Добро пожаловать в LINA», мягкой границей/тенью и небольшим L avatar.
Stored representation не изменена. Copy: приветствие с именем, затем объяснение личного чата и будущего ответа.
Unknown system resolver fallback сохранён. Реальному SYSTEM не приписываются дата или время, которых нет в DTO.

## 9. USER bubble

Справа, спокойная светло-зелёная поверхность, нижний угол справа. Text wrapping для длинных строк.
Время поддерживается presentation model, но сейчас есть только у явно обозначенных fixtures.

## 10. OPERATOR bubble

Слева, белый bubble с тонкой границей и небольшим L avatar. Не отображает придуманные данные реального оператора.

## 11. Composer

Inline SVG attachment (+), multiline textarea и send arrow. Все controls disabled, есть явная подпись
«Отправка сообщений пока недоступна». Нет form submit, callbacks, API calls, upload или fake send.
Textarea min-height 42px, max-height 136px, resize:none. Подготовлены presentation props disabled/loading/error
и aria-busy/error styling. Enter/Shift+Enter handling, autosize и реальная отправка оставлены Stage 3.

## 12. Landing

Общий L mark, LINA, «Ваш личный чат с менеджером», короткая supporting строка, label имени, input и «Начать».
Все существующие bootstrap/Web Lock/Start handlers сохранены. Никаких дополнительных обязательных полей.

## 13. Tokens/colors

CSS variables: primary #315e52, accent #497767, background #eeefeb, history #f7f8f5, white surface,
text #263c35, muted #68756d, USER #e0ece3. Time и preview contrast уточнены отдельными tokens.
System/native font stack; внешние fonts/icons/dependencies не добавлены. Palette временная, VX branding нет.

## 14. Responsive behavior

Проверены 320/360/390/414/430px, desktop 1440px, low-height, landscape и 320×240. Горизонтального overflow нет;
LI не выталкивает элементы; textarea 16px; composer/send button остаются в viewport. Реальный welcome с
70-символьным Unicode именем и fixture с длинной ASCII строкой корректно переносятся.

## 15. Scroll architecture

Shell height:100dvh/min-height:0/overflow:hidden. Messenger — flex column/min-height:0/overflow:hidden.
Header/composer flex:none. History flex:1/min-height:0/overflow-y:auto/overscroll-behavior:contain.
Document scrollTop=0. Реальной прокруткой подтверждён конец истории, включая stress 320×240:
scrollTop=1369, scrollHeight-clientHeight=1369. Desktop low-height: 984.5 из 985px (субпиксельное округление).
Initial bottom/near-bottom threshold/auto-scroll/new-message indicator/polling position preservation не реализованы.

## 16. Accessibility

Semantic buttons и textarea label, icon-only aria-label, понятные disabled states, focus outline,
focusable messages region, ol/li/article message structure. Полное длинное имя остаётся текстом welcome.
Измеренный contrast основных пар: text/history 11.07:1, muted/history 4.52:1, accent/white 5.10:1,
white/primary 7.36:1. Time text усилен отдельно на USER background. Системная клавиатурная фокусировка видна.
Реальные iPhone/Android software keyboard и ненулевые safe-area insets требуют physical-device QA.

## 17. Dev-only preview

GET /dev/messenger — Server Component с NODE_ENV === production → notFound() до fixtures rendering.
Никаких imports identity/DB/cookies, только render-layer массив MessageView. Явный banner сообщает, что
сообщения/время являются примерами и не сохраняются. Сегодня также помечено как пример.
Счётчики Client/Conversation/Message до и после трёх preview GET совпали.
Production HTTP assertion: /dev/messenger →404; /?preview=messenger не включает fixtures.
URL: http://localhost:55443/dev/messenger

## 18. Viewports

Landing: 320/360/390/414/430 ×844, desktop 1440×900.
Messenger/preview: 320×740, 360×800, 390×844, 414×896, 430×932, 1440×900,
1440×500, 844×390 landscape и 320×240 stress.
При каждом проверялись document width, composer/send visibility и ограниченная история.
Ранние немедленные scroll measurements после resize местами опережали завершение прокрутки;
отдельные повторные проверки после layout settlement подтвердили lastReachable для этих размеров.

## 19. Browser QA

Исходный UI осмотрен. Новый anonymous landing открыт; через настоящий Start создан test Client LI000225
с длинным Unicode именем; reload и последующий restart dev server сохранили тот же LI ID.
Preview SYSTEM/USER/OPERATOR проверен визуально. Реальные wheel scroll действия довели историю до последнего
bubble; body не скроллился. Controls composer disabled. Production HTTP identity smoke проходит.

## 20. Screenshots/visual QA

Шесть capture artifacts находятся в .local-test/ui25-screenshots (локальные, Git ignored):
desktop-landing.png, desktop-messenger.png, desktop-preview.png — 1440×900;
mobile-landing.png, mobile-messenger.png, mobile-preview.png — 390×844.
Файлы содержат исходные browser image bytes (браузер может вернуть JPEG с данным именем файла).
Real Messenger screenshots намеренно показывают длинное test name, чтобы было видно wrapping.
Некоторые ранние screenshots сняты до финального скрытия dev badge/уточнения time contrast; основная композиция
не менялась. Anonymous повторно снимался через loopback IP без удаления cookies; реальный Start тестировался
на canonical localhost, который нужно использовать пользователю.
Во время повторной записи captures auto-review сообщил usage limit. После пользовательского «продолжай»
стандартный browser tool снова стал доступен, мобильный Messenger capture завершён без альтернативного механизма.

## 21. Lint

ESLint . --max-warnings 0: exit 0. Новые правила не отключались. Dependency versions не менялись.

## 22. Typecheck

next typegen + strict tsc --noEmit: exit 0; финальная сборка также прошла TypeScript.

## 23. Unit tests

15 passed, 0 failed/skipped. Изменено только ожидаемое значение welcome copy в существующем resolver test.
Crypto, names, LI, emoji, env и health unit tests проходят.

## 24. DB tests

18 passed, 0 failed/skipped. Создана отдельная disposable БД lina_test_ui25 в существующей локальной PostgreSQL;
к ней применены только существующие миграции. Manual-view lina_test не очищалась.
Atomic identity, concurrency, lost response, revocation/expiry, admin separation, rate ceiling и Stage 1 invariants
проверены прежними тестами. Fixtures этой regression DB не являются preview messages приложения.

## 25. Production build

pnpm build: exit 0, Prisma generate + Next production build + standalone assets. После финального CSS contrast
уточнения build повторён успешно. HTTP harness после финальной сборки прошёл, включая production preview 404.
Никакого deployment, remote DB, Docker/PM2/Nginx/DNS/SSL действий.

## 26. Player Identity

Не переписан. SHA-256 snapshots до/после подтвердили неизменность всех src/server, API routes, Prisma files,
LI/emoji helpers. Player DTO не расширялся. В src/lib/player.ts изменён только разрешённый UI welcome copy.
Настоящий browser Start/reload и двухпроцессный HTTP smoke подтверждают отсутствие identity regression.

## 27. Stage 3

Не реализован: USER send, mutations, polling, unread/read marker updates, activation, OPERATOR API,
Admin, attachments upload, WebSocket/SSE отсутствуют. Welcome оставляет firstUserMessageAt null.

## 28. Git status/diff summary

main, no commits, no remote; файлы по-прежнему untracked. Ничего не staged/committed/pushed.
139 учитываемых untracked файлов после отчёта: прежние 133 +4 новых UI/report +2 Next-generated agent files.
Основной diff — presentation components/CSS/copy, render-only preview, UI regression assertion и документация.
Обычный git diff пуст из-за отсутствия HEAD. node_modules/.next/generated/.local-test не включены в Git.

## 29. Localhost для ручного просмотра

http://localhost:55443

Dev server и PostgreSQL 127.0.0.1:55439 оставлены запущенными. Использовать именно localhost, поскольку
LINA_ORIGIN проверяет Origin. Старый Stage 2 server на 55440 остановлен; production HTTP harness освобождает
55440/55442 после smoke. Локальный dev pepper хранится только в ignored .local-test/ui-preview.pepper с mode 0600,
поэтому рестарт этого launcher больше не меняет тестовый ключ. Production secrets не создавались.

## 30. Preview URL

http://localhost:55443/dev/messenger

Открывается без регистрации, только в dev. Все сообщения — fixtures, composer не работает.
Stage 3 не начинается после отчёта. Сервер оставлен для ручного просмотра.
