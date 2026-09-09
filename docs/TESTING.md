# Testing Strategy

## Unit

- name/locale validation;
- token generation/hash/cookie attributes;
- VX ID formatter и emoji fallback;
- Active/Archive predicate, unread math;
- systemKey rendering RU/EN/TR/AZ;
- attachment filename/MIME/size policy.

## Database/integration

- start transaction создаёт ровно 1 Client/credential/conversation/welcome;
- concurrent starts/messages: no duplicate/sequence collision;
- ownership and admin authorization matrix;
- first USER sets firstUserMessageAt, SYSTEM/OPERATOR/open/read — нет;
- tags CRUD/many-to-many/cascade relation only;
- archive/reopen and unread markers do not reorder;
- attachment store failure rolls back metadata/cleans temp;
- expired/revoked token rejected.

## Browser/E2E

- fresh context: enter name→Messenger; reload returns same VX ID/history;
- another context cannot access it by VX ID;
- admin Archive sees new client, Active only after first USER message;
- bidirectional messages independent for two clients;
- upload preview/remove/send/download/error;
- mobile 320/360/390/414/430 portrait+landscape, desktop short viewport/zoom;
- composer visible, last message fully reachable, scroll position preserved;
- RU→EN→TR→AZ without reload; html lang matches; user text unchanged.

## Release gates

`lint`, `typecheck`, Prisma validate/generate, unit/integration, production build, migration against empty DB and previous schema, public smoke, readiness DB pass. Не считать visual screenshot доказательством authorization — API tests обязательны.
