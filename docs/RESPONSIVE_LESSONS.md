# Responsive Lessons

Главный production-урок VX House: исчезающий composer и непрокручиваемое последнее сообщение были следствием несогласованной цепочки высот и overflow, а не отсутствия `position: sticky`.

## Надёжная структура

```css
.shell { height: 100dvh; min-height: 0; overflow: hidden; }
.conversation { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
.header, .composer { flex: none; }
.messages { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.composer { position: sticky; bottom: 0; z-index: 2; }
```

Каждый grid/flex ancestor message pane обязан иметь `min-height: 0`; outer page не должен быть scroll owner. Composer должен находиться sibling к messages, а не внутри прокручиваемой истории. Добавить bottom padding истории и scroll-margin, чтобы последнее bubble не перекрывалось.

## Viewport и mobile keyboard

- Использовать `100dvh`, safe-area insets и `font-size:16px` в inputs на iOS.
- Не задавать desktop `min-height`, превышающий экран, на mobile.
- При keyboard resize опираться на dvh/VisualViewport, но не пересчитывать layout в бесконечном loop.
- Тестировать не только width, но высоты 568/667/844 px, zoom 80–200%, browser chrome и landscape.

## Admin breakpoints

- >1180: 2 columns + optional info.
- 760–1180: list + chat, info overlay/drawer.
- <760: один экран list или chat; fixed bottom navigation не должна перекрывать composer.
- Tag filters `overflow-x:auto; flex-wrap:nowrap`, chat item text `min-width:0`.

## Обязательные regression assertions

Для 320/360/390/414/430 widths и desktop compact-height проверять: composer bounding box внутри viewport; messages `scrollHeight > clientHeight` и scrollTop достигает bottom; последнее message полностью выше composer; нет horizontal overflow.
