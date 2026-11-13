# Charts — чарт-блоки на проектах и на Home

Ветка `feat/charts`. В `main` не мержится до запуска на Product Hunt 17.11.2026 (заморозка).
Задача в Needt: `cmvzdu0mo069hqa01s727jhbg`. OpenSpec: `openspec/changes/add-charts/`.

## Что сделано

Чарт-блок можно поставить на проект или на Home. Он показывает одну из трёх метрик:

| Метрика         | Что считает                                                                                           | Итог в подписи          |
| --------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `task_progress` | закрытые задачи против всех задач, нарастающим итогом на конец каждого дня                            | «6 of 10 done»          |
| `habit_streak`  | отметки привычек по дням, текущая и лучшая серия; `habitId` — одна привычка, без него — все в области | «4-day streak · best 9» |
| `time_spent`    | минуты из завершённых time entries (таймер, ручные, Focus) по дням                                    | «10h 55m · 22m a day»   |

- **Где стоит.** С `projectId` чарт стоит на проекте и считает только задачи, привычки и время этого проекта. Без `projectId` он стоит на Home и считает весь workspace. На одно место — не больше 12 чартов.
- **Вид.** Линия или столбики, период 7, 14, 30 или 90 дней. Шкала начинается с нуля.
- **Данные.** Блок хранит только то, что нужно измерить. Цифры каждый раз считаются заново из задач, отметок привычек и записей времени, в часовом поясе пользователя. Поэтому чарт не может разойтись с данными.
- **Отрисовка.** Свой SVG, как у существующего `Sparkline` в AgentsTab. Новой библиотеки нет.
- **Дизайн по PORT.md.**
  - Карточка белая, на ободке (ring-first), без тени.
  - Цвет проекта есть только у самих линий и столбиков.
  - Серые тона взяты с лестницы альф.
  - Шрифт 13 и 12 px.
- **Удаление и Undo.** «Remove chart» убирает только блок. Тост с Undo возвращает его через журнал действий.

### API (наружу, как у любого объекта)

```http
GET    /api/charts?projectId=… | ?home=true [&series=false]   # chart.list
POST   /api/charts                                          # chart.create
GET    /api/charts/:id                                      # chart.get
PATCH  /api/charts/:id                                      # chart.update
DELETE /api/charts/:id                                      # chart.delete
POST   /api/connect/ops/chart.*                             # те же ops по токену
```

- **Доступ.** Принимает сессию или токен `needt_`: для чтения нужен `needt.read`, для записи `needt.write`.
- **Undo.** Каждая запись возвращает `actionId`.

**MCP:**

- `needt_create_chart` создаёт чарт.
- `needt_update_chart` меняет его; с `remove: true` убирает.
- `needt_get` и `needt_list` принимают `type: "chart"`. `needt_get` отдаёт чарт с рядом и итогом.

Документация — раздел «Charts» в `docs/connector-api.md`.

### UI

- **Проект.** Под шапкой проекта, после целей, идёт секция чартов. Кнопка «Add chart» открывает меню: Progress, Habit streak, Time spent и серия для каждой привычки проекта. В меню «⋯» карточки можно выбрать период, переключить линию или столбики и убрать чарт.
- **Home.** В правой колонке есть плитка «Charts». Её можно выключить и переставить в «Show on Home» (`homeBlocks.charts`).

### Изменённые и новые файлы (главное)

| Часть                    | Файлы                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Данные                   | `prisma/schema.prisma`, миграция `prisma/migrations/20261112210000_charts` (только добавление таблицы `Chart`)                                                                      |
| Логика                   | `src/lib/charts.ts`, `src/services/ops/ops/charts.ts`; регистрация в `registry.ts`, `types.ts` и `undo.ts`                                                                          |
| API и MCP                | `src/app/api/charts/**`, `src/services/connectors/mcp/tools.ts`                                                                                                                     |
| UI                       | `src/components/needt3/charts/Charts.tsx`, `src/lib/needt3/hooks/charts.ts`, `src/styles/v3-overrides/charts.css`; встроено в `ProjectPage.tsx`, `HomeScreen.tsx`, `home-blocks.ts` |
| Учёт данных пользователя | `account-export.ts`, `scripts/admin/reset-user-data.cjs`                                                                                                                            |

## Проверка

| Что                                                                     | Результат                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`                                                          | чисто                                                                                                                                                                                                             |
| `eslint --max-warnings=0` (затронутые папки + pre-commit по всему репо) | чисто                                                                                                                                                                                                             |
| `npm run test:unit`                                                     | 1010 сьютов, 9922+ тестов зелёные. Единственное падение было в `admin-reset-user-data`: модель Chart не попала в план сброса. Добавил её туда, тест зелёный                                                       |
| Новые юнит-тесты                                                        | `src/lib/__tests__/charts.test.ts` (10), `src/services/ops/__tests__/charts.test.ts` (8), `src/app/api/charts/__tests__/charts-route.test.ts` (3), `src/services/connectors/mcp/__tests__/mcp-charts.test.ts` (3) |
| Миграция                                                                | применена к локальному Postgres в Docker. `prisma migrate diff` против схемы пустой                                                                                                                               |
| E2E Playwright `tests/charts.spec.ts`                                   | 2/2 зелёные, на production-сборке (`next start`) против локальной БД                                                                                                                                              |

## Скриншоты

Тёмная тема, сделаны e2e-тестом:

- `docs/charts-screenshots/project-progress-line.png` — прогресс-линия на проекте
- `docs/charts-screenshots/project-two-charts.png` — Progress (столбики) и Time spent на проекте
- `docs/charts-screenshots/home-time-spent.png` — плитка Charts на Home

На скриншотах длинная подпись обрезает заголовок («Time sp…»). После съёмки CSS поправлен: теперь заголовок важнее подписи. Повторно не снимал, нужна новая сборка.

## Как попробовать локально

```bash
docker run -d --name needt-charts-pg -e POSTGRES_USER=needt -e POSTGRES_PASSWORD=needt \
  -e POSTGRES_DB=needt_charts -p 127.0.0.1:55441:5432 postgres:16-alpine
docker run -d --name needt-charts-redis -p 127.0.0.1:56381:6379 redis:7-alpine
# .env (в git не попадает) — фиктивные значения: DATABASE_URL/DIRECT_URL на 55441, REDIS_URL на 56381,
# NEXTAUTH_URL=http://localhost:3017, NEXTAUTH_SECRET=<любая строка>, COLLABORATION_DISABLED=1
npx prisma migrate deploy && npx tsx prisma/ci-seed.ts
PORT=3017 npm run dev
# e2e со скриншотами:
CI=1 PORT=3017 TEST_BASE_URL=http://localhost:3017 CHARTS_SHOTS_DIR=$PWD/docs/charts-screenshots \
  npx playwright test tests/charts.spec.ts
```

Через MCP: `needt_create_chart { metric: "habit_streak", habitId: "…" }` ставит чарт на Home. После этого `needt_get { type: "chart", id }` вернёт его вместе с рядом.

## Открытые вопросы

1. **Плитка Charts на Home включена по умолчанию.** Пока чартов нет, в ней видна только тихая кнопка «Add chart». Это новая строчка на Home у всех пользователей. Варианты: выключить плитку по умолчанию или показывать её только тогда, когда есть хотя бы один чарт.
2. **Тариф.** Сейчас чарты доступны на Free. Нужен ли гейт Pro, как у целей, и флаг (`feature-flags-keys.ts`) на время выкатки?
3. **«Любое поле во времени»** (из описания задачи). Пока нет: непонятно, какие поля брать — custom properties задач или колонки баз страниц. Нужно решение по источнику.
4. **Повторяющиеся задачи.** В прогрессе они считаются один раз, по мастеру; экземпляры не считаются. Так нормально?

## Что не сделано

- Нет телефонного UI: ни PhoneHome, ни телефонной страницы проекта.
- В UI нельзя перетаскивать чарты (порядок задаётся через API полем `position`), переименовывать и выбирать привычку для уже созданного чарта. Через API и MCP всё это работает.
- Метрика «любое поле во времени» (см. открытые вопросы).
- Визуальные эталоны (`test:visual`) не обновлялись. Чистые e2e остальных экранов не прогонял.
- В `main` ничего не мержилось, деплоя и миграций на живой БД не было.
