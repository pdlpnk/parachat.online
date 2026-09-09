# VX House Chat-Only — технический handoff

Этот каталог — изолированный пакет для разработки **нового отдельного сайта**, а не модуль текущего VX House. Он фиксирует проверенные решения Messenger и предлагает минимальную архитектуру продукта:

`имя → Begin → постоянный Client → личный Messenger → администратор`

## Жёсткие границы

- Не подключать этот каталог к `app/`, сборке или runtime текущего VX House.
- Не применять приложенную рекомендуемую Prisma-схему к production-базе VX House.
- Не переносить пользовательскую регистрацию, email/password, onboarding, rewards/tasks, Keitaro или CMS.
- Не считать `VX ID` или имя секретом аутентификации.
- Не копировать production `.env`, дампы, логи, uploads или реальные пользовательские данные.

## Как читать пакет

1. Начать с [MASTER_HANDOFF.md](./MASTER_HANDOFF.md).
2. Зафиксировать продуктовые границы по `docs/PRODUCT_SCOPE.md`.
3. До UI реализовать модель из `docs/CLIENT_IDENTITY.md`, `docs/DATABASE.md` и `reference/prisma/recommended-chat-only-schema.prisma`.
4. Переносить файлы из `reference/source/` только согласно классификации в `docs/SOURCE_MANIFEST.md`.
5. Реализовать API, затем UI, затем Active/Archive, теги, вложения и polling.
6. Перед выпуском пройти `docs/SECURITY.md`, `docs/TESTING.md` и `docs/DEPLOYMENT.md`.

## Состав

- `docs/` — спецификация нового продукта и эксплуатационные решения.
- `reference/source/` — выборочные проверенные исходники текущего VX House.
- `reference/prisma/` — снимок релевантных текущих моделей и рекомендуемая новая схема.
- `reference/.env.example` — безопасный контракт окружения без секретов.
- `manifest.json` — машиночитаемое оглавление и классификация артефактов.

Пакет не содержит production-секретов и не выполняет никаких действий сам по себе.
