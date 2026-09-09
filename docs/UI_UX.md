# UI / UX

## Landing

Один смысловой блок: логотип/обещание, label «Ваше имя», accessible input, primary `Begin`. Пока запрос идёт — disable + progress; validation inline; retry сохраняет имя.

## Client Messenger

- Header: менеджер, status presentation, locale/menu при необходимости.
- Message pane: единственный scroll container.
- Composer: отдельная последняя row layout, всегда видим.
- Floating launcher только вне full Messenger; все входы ведут к одному conversation.
- Большие readable bubbles, avatar и whitespace; без ticket cards/status/category.

## Admin Messenger

- Desktop: conversations | chat | optional info panel.
- Info panel закрыта по умолчанию и открывается Info.
- Mobile: list→chat navigation, back button; не пытаться держать три колонки.
- Active/Archive и tag chips не перезагружают страницу.
- Search debounce, selected conversation устойчив при list refresh.

## Avatar

Единый компонент: image → avatarEmoji → initials. Emoji не смешивать с online dot и tags. Admin avatar можно оставить initials/image; client emoji стабильно сохраняется в БД.

## Accessibility

Все icon buttons имеют aria-label, tabs — корректные roles/state, ошибки — `role=alert`, messages — `aria-live=polite` без повторного озвучивания всей истории. Focus возвращается после modal/popover; reduced motion соблюдается.
