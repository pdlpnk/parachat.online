# LINA Stage 6 — Themes, fonts, localization

Production не подключался и не менялся. Работа выполнена в текущем LINA repository и отдельных локальных QA БД.

## 1–2. DB

Client.uiTheme и Client.uiFont: VARCHAR(16), NOT NULL, defaults light/modern, CHECK whitelist.
Locale enum расширен FA. Migration: `20260913010000_player_preferences`.
Существующие locale, LI, credentials, permanent Conversation, messages/attachments/tags сохраняются.
Миграция проверена как на новой локальной БД, так и на существующей Stage 5 QA БД.

## 3. Пять тем

| Token | Название | Page | Surface | Incoming | Outgoing | Primary |
|---|---|---|---|---|---|---|
| light | LINA Light | #eeefeb | #ffffff | #ffffff | #e0ece3 | #315e52 |
| emerald | Carbon + Emerald | #080b0a | #101412 | #191e1b | #163d30 | #35d38a |
| purple | Graphite + Purple | #0e0e12 | #15151b | #202029 | #342553 | #b18aff |
| orange | Warm Black + Orange | #0d0c0b | #141210 | #201d19 | #4a2a16 | #ff914d |
| coral | Black + Red Coral | #09090a | #111113 | #1d1d20 | #482125 | #ff7c84 |

Текст/приглушённый текст/borders/focus/error/accent также централизованы в globals.css.
Направление исходных палитр сохранено; некоторые цвета осветлены для контраста.

## 4. Theme engine

Player root получает SSR data-theme/data-font/lang/dir из resolvePlayer.
CSS custom properties ограничены `.player-root`: Admin остаётся прежним.
Смена темы не меняет layout и не требует загрузки шрифтов/внешних ресурсов.
Light → Dark hydration flash отсутствует по конструкции: первый HTML уже имеет DB theme.

## 5. Шрифты

- Modern: системный sans (-apple-system / Segoe UI / Arial).
- Soft: Trebuchet MS / Verdana / Arial Rounded / Tahoma.
- Tech: системный monospace (Cascadia / SFMono / Consolas / Liberation Mono), Tahoma fallback.

Без внешних font CDN, downloads или новых dependencies. Конкретный шрифт зависит от ОС.
RU/EN/TR/AZ поддерживаются через системные fallback, Persian использует доступный Arabic-capable fallback.
LI остаётся monospace независимо от preset. Шрифт применяется к general UI и сообщениям.

## 6–7. Persistence и API

PATCH `/api/player/preferences`, JSON `{theme?,font?,locale?}`, максимум 512 bytes.
Secure Player cookie, exact Origin, только собственный Client; неизвестные поля/значения отвергаются.
Ответ содержит только theme/font/locale. Никаких arbitrary CSS/font-family и clientId в payload.
UI даёт optimistic preview, принимает DB result, при ошибке возвращает предыдущие настройки и показывает localized error.
Лимит 30 изменений/мин/Client на Node process, bounded 10k active buckets; advisory transaction lock
защищает от одновременных записей одного Client между процессами. Текущий PM2 — один instance.
При горизонтальном масштабировании per-minute limiter следует вынести в общий store.
localStorage/sessionStorage не используются.

## 8–9. Landing

Компактные пять language pills, один выбран. Navigator.language preselect:
ru/TR/az/fa по базовому тегу; прочие языки → EN. Пользовательский выбор имеет приоритет.
SSR anonymous fallback EN; browser detection применяется при hydration.
Start передаёт locale в создание Client и sourceLocale welcome. Старые API callers без locale сохраняют RU compatibility default.
Same-browser lock/bootstrap/credential architecture не изменена.
В браузере проверен первый Start с выбранным FA: новый Client сразу получил Persian welcome.

## 10–12. Localization, RTL, SYSTEM

Один typed словарь `src/lib/player-i18n.ts`: RU/EN/TR/AZ/FA, одинаковый набор ключей.
UI labels, composer, settings, network/session/retry/upload errors локализованы.
Backend errors в Player отображаются через безопасные localized категории статуса, не как произвольный текст сервера.
Admin UI не локализовался.

Только известный system.welcome получает safe structured DTO key + проверенное scalar name.
Произвольные systemParams и неизвестные internal keys не выдаются. Unknown key → localized neutral fallback.
При изменении locale welcome разрешается заново без переписывания DB Message.
USER/OPERATOR body не переводится. React экранирует имя; replacement не интерпретирует `$` в имени.

FA root dir=rtl/lang=fa; layout/pickers зеркалятся. Message author sides сохраняются через row direction=ltr,
сам текст dir=auto/unicode-bidi plaintext. LI и timestamps dir=ltr, filenames dir=auto, logo LTR.
Проверен mixed draft Persian + URL + LI000001 + English.

## 13–14. Responsive и accessibility

Визуальные screenshots/checks: Light RU, Carbon EN, Purple TR, Orange AZ, Coral FA.
Матрица 320×568 / 360×640 / 390×844 / 414×736 / 430×932 / 844×390 / 1280×600:
page scrollWidth равен viewport; dialog scrollWidth равен clientWidth; composer помещается.
На 320px FA проверены bottom sheet, все пять circles, font/language pills и attachment preview.
Во время QA исправлен светлый hardcoded фон attachment preview и его muted подписи в dark theme.

Gear target 44×44, swatches не менее 44px. Selected state имеет checkmark/ring/aria-pressed.
Native modal + explicit Tab/Shift+Tab wrap; Escape/X и restore focus на gear.
Tab и Shift+Tab на границах dialog проверены в браузере: фокус остаётся внутри.
Цвета основного/muted/error текста проверены расчётом контраста; Light muted усилен, dark пары выше 4.5:1.
Нет layout animation или motion effects, reduced-motion не требует отдельной анимационной ветки.

VisualViewport resize корректирует высоту Player при мобильной клавиатуре без отключения zoom.
Физическая iOS/Android клавиатура и полноценная screen-reader сессия в этом окружении не проверялись;
их smoke включён в upgrade checklist. Это честное ограничение desktop viewport QA.

## 15–16. Tests и gates

Unit: 33 PASS. DB integration: 65 PASS (preferences + старые identity/messages/admin/attachments).
Preferences HTTP: auth, Origin, size, whitelist, isolation, FA Start, SSR theme/font/RTL/LI,
welcome locale change, unchanged stored message, safe DTO, production preview 404.
Stage 5 attachments HTTP: 23 PASS; Admin HTTP: 54 PASS; Player messages HTTP: 104 PASS;
Player identity HTTP smoke PASS.

ESLint, typecheck, Prisma validate/generate, production standalone build и assets preparation — PASS.
Реальные env, secrets, локальные DB/uploads и QA fixtures не коммитятся.

## 17–18. Git

Commit message: `Add player themes fonts and localization`, origin/main.
Полный SHA и подтверждение push — в финальном ответе.

## 19–21. Upgrade / env / regression

[Точные команды ручного обновления](../deploy/STAGE6_UPGRADE.md): отдельный release,
backup DB + uploads, новая migration, current switch, restart только lina, PM2 save, smoke.
Новых env/secrets нет. Существующий ATTACHMENT_STORAGE_DIR и CLIENT_CREDENTIAL_PEPPER сохраняются.
DNS/Nginx/HTTPS/DB-user/PM2 архитектура не меняются. Production команды не выполнялись.
Attachments backend, tag color model, Admin auth, LI и permanent conversation не переписаны;
regression suites включают отправку, retry, polling/read/unread, Admin и attachments/tags.

## Дополнение: Admin themes

Admin теперь получает те же пять палитр через shared CSS selectors; второй набор цветов отсутствует.
Это дополнение заменяет утверждения выше о неизменной светлой теме Admin.
Admin.uiTheme сохраняется независимо от Client; миграция `20260914010000_admin_theme`, default light,
DB CHECK whitelist. PATCH /api/admin/preferences принимает только {theme}, максимум 512 bytes,
проверяет exact Origin и действующую Admin session; Admin ID берётся только из session.
Сохранённая тема присутствует в SSR. Cookie/auth/expiry/logout не изменены.
Общий settings dialog переиспользован с единственным разделом «Оформление»; Admin fonts/languages отсутствуют.

Проверки дополнения: unit 33 PASS, DB 66 PASS, Admin HTTP 64 PASS, attachments HTTP 23 PASS,
Player preferences HTTP PASS; lint/typecheck/Prisma validate/generate/standalone build PASS.
DB coverage: default, все пять значений, invalid, независимый второй Admin, revoked/anonymous,
новая сессия после logout/login. HTTP coverage: Origin/body/ownership fields/auth/SSR всех тем.
В браузере сняты Light/Emerald/Purple/Orange/Coral; проверены отдельные цвета тегов,
image/video/PDF, settings, tag picker и master/detail на 320/360/390/414/430, 844×390, 1280×600/720.
Переполнения нет; Tab wrap и bottom sheet проверены. Физическая мобильная клавиатура не проверялась.
Новых env/secrets нет. Production не подключался и не менялся.
Итоговый SHA дополнения и push приводятся в ответе; для выкладки использовать обновлённый STAGE6_UPGRADE.md.
