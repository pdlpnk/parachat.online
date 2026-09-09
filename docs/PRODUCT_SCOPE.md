# Product Scope

## В продукте

- Публичный минимальный лендинг.
- Поле имени и CTA `Begin`.
- Автоматическое создание постоянного клиента и последовательного `VX ID`.
- Один постоянный Messenger на клиента.
- Локализованное welcome SYSTEM-сообщение.
- USER/OPERATOR/SYSTEM сообщения, история, unread, read markers.
- Безопасные image/PDF attachments.
- Admin login, Active/Archive, поиск, теги, внутренние заметки.
- Emoji/avatar fallback, online/offline как отдельный presentation indicator.
- RU/EN/TR/AZ для системного UI.

## Явно вне продукта

- Email, телефон, пароль и клиентский login.
- Email confirmation, password reset, onboarding.
- User profile/public profile, Tasks, VX Points, Trust Score, Progress, Rewards, ranks/economy.
- Partner accounts, CMS и сложные permissions для клиента.
- Keitaro, analytics attribution, subid и postbacks.
- Tickets, categories, priority, operator status и создание новых rooms.
- WebSocket/reactions/read receipts/voice как требование MVP.

## Основной journey

1. Новый браузер открывает лендинг; locale: сохранённый выбор → browser language → EN.
2. Пользователь вводит имя и нажимает Begin.
3. Сервер создаёт Client, credential, Conversation и SYSTEM welcome.
4. Ответ устанавливает HttpOnly cookie и возвращает безопасный view.
5. Messenger открывается. До USER message разговор находится в Archive у admin.
6. После первого USER message разговор становится Active.
7. Администратор отвечает в том же постоянном разговоре.

## Ограничение identity MVP

Cookie делает доступ постоянным только в рамках браузерного профиля. Очистка cookie, новый браузер или устройство означают новый Client. Не обещать cross-device recovery без отдельной recovery-механики; имя и VX ID для восстановления недостаточны и небезопасны.
