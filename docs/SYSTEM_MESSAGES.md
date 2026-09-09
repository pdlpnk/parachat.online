# System Messages

SYSTEM message — структурированное событие, а не заранее переведённая строка.

Рекомендуемые поля: `systemKey`, `systemParams Json`, `sourceLocale`; обычный `body` для SYSTEM null. Пример:

```json
{"systemKey":"system.welcome","systemParams":{"name":"Alex"},"sourceLocale":"EN"}
```

UI разрешает key только через известный dictionary и безопасно подставляет scalar params. Не исполнять HTML из params. Если key неизвестен, показывать нейтральный локализованный fallback, а не raw JSON.

Welcome создаётся в той же transaction, что Client/Conversation. Это гарантирует один welcome и не активирует Active. Смена UI locale может перерендерить историческое SYSTEM сообщение; USER/OPERATOR text не переводится автоматически.

Минимальные RU/EN/TR/AZ keys: welcome title/body, conversation opened, attachment fallback, generic system message unavailable.
