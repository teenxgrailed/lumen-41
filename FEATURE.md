# Saved views — сохранённые виды задач

Ветка: `feat/saved-views`. Источник: `docs/plans/06-product-gap-audit.md`, п. 2 (P1).
Статус: готово для ревью, **не мержить до запуска на Product Hunt 17.11.2026** (product freeze).

## Что сделано

Бэкенд уже был в репо (модель `SavedView`, `/api/saved-views`, контракт Sol S11),
но нигде не использовался. Эта ветка добавляет UI на экране Tasks и связывает его
с существующим API. **Миграций нет, схема БД не менялась.**

- **Кнопка «Views»** в шапке Tasks, слева от шестерёнки вида. Открывает поповер:
  - список сохранённых видов (свои + общие для воркспейса, с пометкой «Shared»);
  - клик по виду — экран возвращается к сохранённому состоянию;
  - карандаш — переименовать прямо в строке (Enter сохраняет, Esc отменяет);
  - корзина — удалить, в тосте есть Undo (вид пересоздаётся с тем же именем и запросом);
  - внизу поле «Name this view» + Save — сохранить текущее состояние;
  - переключатель «Share» — только в shared-воркспейсе и только для Owner/Editor.
- **Что сохраняется:** вкладка (Inbox/Today/Upcoming/All), фильтр по проекту
  (включая «No project»), сортировка, группировка, режим выполненных задач, «Overdue first».
- **Активный вид** не хранится отдельно, а вычисляется: если текущий список совпадает
  с сохранённым видом, на кнопке вместо «Views» написано его имя и стоит галочка в списке.
- **Доступ через API** (требование CLAUDE.md «данные доступны снаружи»): всё идёт через
  `GET/POST /api/saved-views` и `PATCH/DELETE /api/saved-views/:id`. Формат запроса
  описан в `docs/sol-s11-contracts.md` (раздел Saved Views).

### Изменения контракта (только Zod, не БД)

В `src/lib/saved-views.ts` allow-list расширен аддитивно:
- `groupBy`: + `"date"`;
- `filters.field`: + `"list"`, `"completed"`;
- `sort.field`: + `"scheduledStart"`, `"overdue"`.

Старые клиенты и старые записи продолжают валидироваться.

## Файлы

| Файл | Что |
|---|---|
| `src/lib/needt3/saved-task-views.ts` | чистый кодек: состояние экрана ↔ строка `SavedView` |
| `src/lib/needt3/hooks/saved-views.ts` | TanStack Query: список, создание, переименование, удаление с Undo |
| `src/components/needt3/work/SavedViewsMenu.tsx` | кнопка и поповер |
| `src/components/needt3/work/WorkScreen.tsx` | подключение в шапку Tasks |
| `src/styles/v3-overrides/saved-views.css` | стили (13/12px, серые из лестницы текста, без акцентной заливки) |
| `src/lib/saved-views.ts` | расширение allow-list |
| `src/lib/needt3/__tests__/saved-task-views.test.ts` | юнит-тесты кодека |
| `tests/saved-views.spec.ts` | e2e: UI-цикл + права в shared-воркспейсе |
| `docs/sol-s11-contracts.md`, `changelog.d/saved-task-views.md` | документация, changelog-фрагмент |

## Скриншоты

- `screens/saved-views/01-save.png` — поповер, сохранение текущего списка
- `screens/saved-views/02-list.png` — список видов, действия по строке
- `screens/saved-views/03-after-undo.png` — вид применён, имя на кнопке, тосты

(Снимаются e2e-тестом при каждом прогоне.)

## Как попробовать

```bash
npm install --legacy-peer-deps
# локальная Postgres/Redis (любые свободные порты), dummy-секреты
export DATABASE_URL=postgresql://fluid:fluid@127.0.0.1:55451/needt_views
export DIRECT_URL=$DATABASE_URL REDIS_URL=redis://127.0.0.1:56391
export NEXTAUTH_URL=http://127.0.0.1:3047 NEXTAUTH_SECRET=local-dummy
npx prisma migrate deploy && npx next dev -p 3047
```

Открыть `/tasks` → выбрать вкладку и проект → **Views** → ввести имя → **Save**.
Переключиться на другую вкладку → **Views** → кликнуть по виду.

## Тесты

| Проверка | Результат |
|---|---|
| `npx jest saved-task-views saved-views` | 12/12 ✓ |
| `npm run test:unit` | 996/1007 сьютов ✓ параллельно; 11 упавших DOM-сьютов (не связаны с фичей, таймауты под load ~60) перепрогнаны `jest -i` — 143/143 ✓ |
| `tests/saved-views.spec.ts` (Playwright, локальная БД) | 2/2 ✓ |
| `eslint` по изменённым файлам | 0 ошибок/предупреждений |
| `npm run check:ui-contracts`, `check:branding` | ✓ |
| `npm run type-check` | 1 ошибка, не моя: `src/services/agent-hub/messages.ts:300` (есть в `main` @ a222264c) |

E2E гонялся против отдельного `next dev` (холодная компиляция роутов на этом сервере
дольше стандартных таймаутов Playwright), через временный конфиг без `webServer`.

## Открытые вопросы

1. **Применение вида меняет глобальный `prefs.taskView`.** Сортировка, группировка,
   «выполненные» и «Overdue first» — это одна настройка на Home, Tasks и Calendar
   (так задумано в `task-view.ts`). Применение вида на Tasks поэтому меняет и Home.
   Альтернатива — локальный override только для Tasks; нужно решение владельца.
2. **Колонки / детали строки** (subtasks, duration, project) не сохраняются в вид —
   в схеме нет поля `columns`, а аудит требовал «minimal schema». Если нужны —
   можно положить в `filters` или добавить JSON-колонку (expand-миграция).
3. **Порядок видов** — по `position`, новый в конец; перетаскивания нет.
4. **Undo у тоста «Saved …»** после удаления и восстановления вида указывает на
   старый id → покажет «Could not save the view». Редкий кейс, не чинил.

## Что не сделано

- Телефонный интерфейс (`phone/tasks`) — кнопки Views там нет.
- Виды для Projects / Pages / Boards (`resource` = PROJECTS/PAGES, `boardId`) — только TASKS.
- MCP-инструменты для видов (API есть, отдельных MCP-тулов нет).
- Сделать вид «по умолчанию» при открытии Tasks.
- Полные гейты `npm run build`, `build:worker`, `build:collaboration`, Docker build,
  visual/style-сьюты — не запускались (долго, на общем сервере).
