# Attachments

## UX

После выбора файла всегда показывать preview (для image), имя, размер и remove до send. Ошибка type/size/storage видима и не очищает набранный текст.

## Policy MVP

- Разрешить JPEG, PNG, WebP, PDF.
- Максимум 10 MiB на файл; Nginx `client_max_body_size` немного выше (например 12m).
- Проверять declared MIME, extension и magic bytes; декодировать/перекодировать images при повышенных требованиях.
- Санитизировать filename для display и `Content-Disposition`.

## Storage

Сохранять bytes в private object storage или persistent volume, а в БД — opaque `storageKey`, checksum, MIME, size. Не хранить абсолютный host path и не отдавать uploads статически. Download endpoint сначала проверяет ownership/admin permission.

Если используется local volume: atomic write temp→rename, non-executable mount, backup policy, orphan cleanup после failed DB transaction. Для нескольких app replicas нужен object storage.

Current VX House хранит protected bytes в JSON/БД — это полезный security reference, но для нового сайта рекомендуется blob storage из-за размера и backup cost.
