# Realtime

MVP не требует WebSocket. Проверенный polling проще эксплуатировать.

## Фактический текущий механизм VX House

Player Messenger опрашивает detail endpoint каждые **5 секунд**, сравнивает message IDs/length, обновляет conversation и unread preview. Admin Workspace каждые **10 секунд** обновляет list и выбранный detail, пропускает polling при `document.hidden` и защищён флагом от одновременных циклов. Search имеет debounce **220 ms**. WebSocket/SSE сейчас нет. Эти интервалы и механизмы приложены как reference; в новом проекте следует добавить AbortController и cursor delta, чтобы устранить stale-response риск.

## Режимы

- Открытый client/admin conversation: каждые 3–5 секунд.
- Admin list: 5–10 секунд.
- Background tab: 20–30 секунд или pause через Page Visibility.
- После send: immediate optimistic/pessimistic refresh; idempotency защищает retry.

Использовать cursor (`createdAt + id`) и ETag/`If-None-Match` для дельт. Не запускать новый request, пока предыдущий не завершён; использовать AbortController при смене диалога/unmount.

## UI rules

- Новое сообщение auto-scroll только если пользователь уже близко к низу (порог ~80 px).
- Иначе показать «новые сообщения», не вырывая позицию.
- При первом открытии — scroll к последнему/read marker.
- Не включать loading indicator в message history так, чтобы он менял persisted scroll semantics.

WebSocket можно добавить позже за API/service boundary, не меняя Message schema.
