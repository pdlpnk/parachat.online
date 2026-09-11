# LINA Stage 5 — Attachments + Tags

Production не подключался и не менялся. Все данные QA — отдельные локальные fixtures.
Player identity, permanent Conversation, password-only Admin и существующие cookies сохранены.

## 1. Архитектура вложений

Один multipart POST содержит text и один file. Origin/auth проверяются до чтения тела.
Файл проверяется и сохраняется под случайным ключом в private storage. Затем Message,
Attachment metadata, sequence и activity сохраняются существующей DB-транзакцией.
Idempotency сравнивает текст, checksum, безопасное имя, MIME и размер: повтор возвращает тот же Message/Attachment.
На успешном повторе лишний файл удаляется. При ошибке/неизвестном результате commit файл остаётся приватным:
немедленная очистка могла бы удалить файл транзакции, чей commit ещё выполняется.
Отдельный cleanup удаляет только непривязанные файлы старше 24 часов; запускать при остановленных загрузках.

## 2. Типы и лимиты

JPEG (.jpg/.jpeg), PNG, WebP, PDF, MP4. Один файл максимум 10 MiB (10,485,760 bytes).
MOV/WebM и транскодирование не добавлены. Воспроизведение MP4 зависит от браузерной поддержки кодека.
Универсальный 10 MiB лимит уменьшает нагрузку на небольшой Droplet; видео 25 MiB не включено.

## 3. Хранилище

Новый server env `ATTACHMENT_STORAGE_DIR`, пример `/srv/lina/shared/uploads`.
Только абсолютный путь вне public/static/.next, директория 0700, новые файлы 0600.
Случайный 32-hex key, exclusive creation, O_NOFOLLOW; filename никогда не становится путём.
DB и uploads нужно резервировать вместе. Без настройки storage текстовый messenger работает,
attachment операции возвращают безопасную ошибку. Новых secrets нет.

## 4. API

- POST `/api/player/attachments`
- GET `/api/player/attachments/:id`
- POST `/api/admin/conversations/:id/attachments`
- GET `/api/admin/attachments/:id`

GET поддерживает один byte range (206/416), что позволяет seek видео.
DTO содержит только id/displayFilename/mediaType/byteSize; storageKey/checksum не выдаются.

## 5. DB и миграция

`20260910020000_attachments_tag_colors`: color default gray/check palette,
MP4 в Attachment mediaType constraint, file-only Message разрешён только при Attachment.
Deferred triggers проверяют итог транзакции и запрещают удаление единственного файла из пустого сообщения.
Существующая Attachment таблица переиспользована. Старые миграции не переписаны.

## 6. Безопасность

MIME + extension + actual size + magic/структура контейнера; reject mismatches.
Auth до upload/read, Player ограничен своим Conversation, Admin требует валидную AdminSession.
Origin/CSRF и существующие session/revoke/expiry сохранены. Player credential не даёт Admin access.
Без публичного filesystem alias; private/no-store, nosniff, same-origin CORP, sandbox CSP.
PDF отдаётся как attachment, изображения/видео inline. Имена очищены от control/path characters.
Не принимаются SVG/HTML/executable MIME. Проверка сигнатур не является антивирусом или полным декодером PDF/media.
Два concurrent upload на процесс и ограниченный поток/таймаут; Nginx upload 11m, text лимиты прежние.
В MVP нет per-client storage quota: необходимо следить за свободным местом.

## 7. Tags UX

Chips в header, click для снятия, '+' открывает небольшой picker с attach/remove,
созданием и цветами. Rename/delete через secondary pencil. Удаление подтверждается внутри picker.
Кнопка «Управлять тегами» удалена. В списке максимум 2 chips и +N.
Цветной dropdown фильтра сохраняет Active/Archive и поиск; catalog обновляется после изменений.

## 8. Цвета

gray, green, blue, purple, orange, red, yellow, teal, pink — фиксированные tokens.
API и DB отвергают arbitrary CSS/hex. Существующие теги детерминированно получают gray.
Player DTO не содержит tags/color.

## 9. Responsive / UI QA

Локальный production standalone, реальная PostgreSQL, in-app Chromium.
Player и Admin проверены при 320×568, 360×640, 390×844, 414×736, 430×932,
844×390 landscape и 1280×600 short desktop. scrollWidth равен viewport width во всех случаях;
composer не выходит ниже viewport. Player проверен с выбранным image preview, Admin с media и тремя chips.
Визуально проверены 320px Player, Admin и tag picker; chips переносятся, video не расширяет страницу.
Это viewport QA, не тест физической iOS/Android клавиатуры.

Проверены file picker с обеих сторон, image preview/remove, text+image, Admin MP4 без текста,
PDF в истории, image с обеих сторон (naturalWidth 320), video с обеих сторон
(duration 5.055s, readyState 4, autoplay false), invalid magic сохраняет текст и выбранный файл.
Full-size URL открылся как image document 320×200; дополнительная DOM-инспекция native viewer
зависала в браузерном инструменте, поэтому не заявляется как отдельная успешная проверка.
Теги: create/autoattach, one-click remove/re-attach, rename+color, delete, 2 chips +1.
Цветной фильтр VIP проверен в браузере: dropdown закрылся и остался только соответствующий диалог.

## 10. Тесты

- Unit: 30/30 PASS.
- PostgreSQL integration: 64/64 PASS.
- Attachment HTTP: 23 проверки PASS.
- Admin HTTP: 54 проверки PASS.
- Player messages HTTP: 104 проверки PASS.
- Player identity HTTP: PASS (два процесса, cookies, retry, SSR, Origin, health).
- Отдельно применены первые пять миграций в новой local DB, создан старый AdminTag,
  затем Stage 5 SQL: существующий tag получил gray — PASS.

Attachment tests покрывают валидные PNG/JPEG/WebP/PDF/MP4, invalid MIME/extension/magic/size,
unauthorized/cross-conversation read, Admin read, path traversal, retry/concurrency,
text+file/file-only и rollback sequence. Tag tests покрывают palette/persistence,
attach/remove/filter/rename/delete и отсутствие цветов в Player DTO.

## 11. Gates

ESLint (0 warnings), Next typegen + tsc --noEmit, Prisma validate/generate,
Next production build и prepare-standalone — PASS, Node 24 / pnpm 11.19.
Nginx example изменён только для новых upload locations; реальный Ubuntu nginx -t выполняется перед deployment.

## 12–13. Git

Release commit message: `Add attachments and improve tag UX`, branch main, origin
`https://github.com/pdlpnk/parachat.online.git`. Итоговый SHA и подтверждённый push указаны в ответе.
Local test DB/media/pepper и env secrets исключены из Git; tracked env только безопасные examples.

## 14. Production upgrade

Полные последовательные команды: [deploy/STAGE5_UPGRADE.md](../deploy/STAGE5_UPGRADE.md).
Нужны новый release, private uploads/env, согласованный backup, одна Stage 5 migration,
два LINA Nginx locations, переключение current, restart только lina, PM2 save и smoke.
Не нужны новая DB, новый Admin, ротация secrets, DNS или изменения других проектов.
Команды в этой задаче не выполнялись.
