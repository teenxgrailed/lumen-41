# Редизайн: оставшиеся страницы на needt3

Ветка `feat/redesign-remaining`, 13.11.2026. Только ветка: в `main` и прод не попадает (заморозка до запуска на Product Hunt 17.11.2026).

## Что сделано

1. **Аудит** всех 51 маршрутов: `REDESIGN-AUDIT.md`. Новый UI уже почти везде в приложении. Старый остался в основном на публичных страницах, в части админки и в нескольких встроенных кусках.
2. **Перенос на needt3** (только внешний вид: обработчики, запросы, поля форм и редиректы прежние):

| Страница | Файлы | Что заменено |
|---|---|---|
| `/admin/operations` | `src/app/(app)/admin/operations/page.tsx` | lucide → `react-icons/lu`, shadcn `Button` → `.nx-btn`, `bg-amber/red/emerald-500` → `--success`/`--destructive`/`--text-tertiary`, строки `admin-rows` |
| `/share` | `src/components/needt3/share/SharePage.tsx` | `Button`/`NeedtPicker` → `.nx-btn`, `SSelect`, `Segmented`, `nt-input`; карточка ring-first |
| `/book/cancel/[token]` | `src/app/book/cancel/[token]/*` | карточка `pub-card`, кнопка `nx-btn-danger` |
| `/oauth/logout/signing-out` | `src/app/oauth/logout/signing-out/*` | то же |
| 404 и ошибка (корень), `/p/[token]` 404 | `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/p/[token]/not-found.tsx` | карточка needt3 |
| `/privacy`, `/terms`, `/support`, `/subprocessors` | `src/components/legal/LegalDocument.tsx` | типографика документа как в редакторе Docs, без Tailwind |
| `/b/[id]/[token]` (публичный мудборд) | `src/app/b/[id]/[token]/page.tsx` | инлайн-стили → классы `pub-*` |
| `/book/[slug]` | `src/app/book/[slug]/*` | слоты `.nx-btn` с выбранным состоянием-кольцом (вместо заливки), поля в колонке 105px |
| `/oauth/authorize` | `src/app/oauth/authorize/*` | карточка needt3, `SSelect` для workspace; имена полей, hidden-поля и `action` не тронуты |

Общая рамка для публичных страниц: `src/components/needt3/states/PublicScope.tsx` + `src/styles/v3-overrides/public.css`. Тема берётся с `<html>` (её ставит pre-paint-скрипт), поэтому вошедший пользователь видит свою тему, а гость — ту же, что раньше (тёмную по умолчанию), без мигания.

Коммиты: `b55176e0` аудит · `67d97564` admin/share · `00dc1b48` рамка + карточки · `fd7e9f9b` legal + мудборд · `8e8b9847` booking + OAuth · `d5eba523` моки в тестах · `f2fa74ac` тема + скриншоты.

## Скриншоты до/после

`docs/redesign-shots/<имя>.before.png` и `<имя>.after.png`, 1440×900, локальный сервер с посевом:

| Страница | Файлы |
|---|---|
| `/admin/operations` | `admin-operations.{before,after}.png` (данные — фикстура, локально нет очередей) |
| `/share` | `share.{before,after}.png` |
| `/book/[slug]` | `book-slug.{before,after}.png` |
| `/book/cancel/[token]` | `book-cancel.{before,after}.png` |
| `/b/[id]/[token]` | `moodboard-public.{before,after}.png` |
| `/oauth/authorize` (ошибка без клиента) | `oauth-authorize.{before,after}.png` |
| `/privacy`, `/terms` | `privacy.*`, `terms.*` |
| 404 | `not-found.{before,after}.png` |

Не сняты: `/oauth/logout/signing-out` (сразу уводит на вход) и `/p/<token>` 404 (пустую ссылку обрабатывает старый `PublicPageView`, до `not-found.tsx` дело не доходит). Тема на снимках `share` до и после разная (тёмная/светлая): это сохранённая тема тестового пользователя на момент съёмки, а не порт.

## Как попробовать

```bash
docker run -d --name rd-pg -e POSTGRES_USER=needt -e POSTGRES_PASSWORD=needt \
  -e POSTGRES_DB=needt_rd -p 127.0.0.1:55470:5432 postgres:16-alpine
docker run -d --name rd-redis -p 127.0.0.1:56470:6379 redis:7-alpine
# .env (в git не попадает) из .env.example: БД 55470, Redis 56470, URL localhost:3031, фиктивный NEXTAUTH_SECRET
npm ci --legacy-peer-deps
npx prisma migrate deploy && npx tsx prisma/ci-seed.ts
PORT=3031 npm run dev
# снимки (сервер должен уже работать):
set -a; . ./.env; set +a
CI=1 TEST_BASE_URL=http://localhost:3031 REDESIGN_SHOTS_PHASE=after \
  npx playwright test -c playwright.redesign.config.ts --project=chromium
```

Открыть руками: `/book/redesign-shots` и публичный мудборд создаёт спек `tests/redesign-shots.spec.ts`; `/privacy`, `/terms`; `/admin/operations` под `ci-lifetime@needt.local`.

## Проверки

- `npm run type-check` — чисто; `eslint --max-warnings=0` на изменённых файлах — чисто.
- Unit: полный `npm run test:unit` — 1003 сьюта прошли, 3 упали из-за CSS-импорта в `PublicScope`; после мока (`d5eba523`) эти три зелёные (не перезапускал весь набор целиком после фикса, только затронутые папки: 139/139).
- e2e: `tests/legal-pages.spec.ts` 4/4 против локального сервера. Полный e2e-набор не запускал: ему нужен отдельный стек `docker-compose.e2e.yml`.
- Независимое ревью диффа: изменений поведения не найдено; два M (мигание темы, потеря темы на 404) исправлены в `f2fa74ac`.

## Где интерфейс перегружен — предложения (не реализовано)

Снимки: `docs/redesign-shots/overload/`. Данные тестовые (проект, 8 задач, 2 цели, 2 привычки у `ci-pro`).

1. **Tasks** (`src/components/needt3/work/*`, `overload/tasks.png`). Одно и то же число показано 6 раз: вкладка «Today 6», «Overdue 3», «Today 3», бейдж на плитке, «8» у проекта в сайдбаре, карточка «8 open». Плюс чип проекта на каждой строке, хотя все строки из одного проекта. **Предложение:** убрать счётчики в заголовках секций и «8 open» на карточке, оставить бейдж вкладки и число в сайдбаре (2 вместо 6). Чип проекта не показывать в списке, отфильтрованном по одному проекту. Это прямо правило CLAUDE.md: «счётчик над строками, которые и так видны, — шум». Риск низкий.
2. **Connections** (`connections/ConnectionsScreen.tsx`, `ConnectionsSetup.tsx`, `overload/connections2.png`). До первой карточки 10 элементов: заголовок, плашка «Nothing connected yet», «Set up», Apps & services / AI tools, Connected / All apps, 3 чипа категорий, поиск — три ряда фильтров на 2 карточки. **Предложение:** «Connected» сделать первым чипом ряда категорий и убрать отдельный переключатель; чипы категорий показывать, только когда карточек больше 6; плашку и «Set up» слить в одну строку (~5 элементов). Переключатель AI tools (вход в Pro) оставить. Риск средний.
3. **Настройки** (`settings/SettingsSheet.tsx`, `DesktopSections.tsx`, `PlanSection.tsx`, `overload/settings.png`). Около 15 пунктов в колонке с прокруткой, над ними большой аватар и промо-карточка тарифа, которая дублирует «Plan & billing». PORT.md §3 описывает девять разделов с поиском. **Предложение:** убрать промо-карточку из колонки, аватар — строкой 32px, свести панели к ~9 (Focus и Shortcuts — в General, Memories — в AI). Риск средний: глубокие ссылки на панели нужно сохранить редиректами.
4. **Habits** (`habits/HabitsScreen.tsx`, `HabitLeft` ~стр. 310, `overload/habits.png`). Мысль «nothing carries over» дважды (подзаголовок и строка под карточками), две декоративные плитки «23 hours left today» / «48 days left» без действия, длинная подпись к графику «Last four months». **Предложение:** убрать дубль, плитки time-left опустить под график или в «…», подпись — в одну строку (~4 блока вместо 6). `HabitLeft` пришёл из прототипа — нужно ваше решение.
5. **Диалог задачи** (`dialogs/TaskDialog.tsx`, `overload/taskdialog.png`). На экране спокойнее, чем в коде (~14 видимых элементов; остальное в поповерах). Один дубль: полоса «First step: Pick 12 looks · Start focus» повторяет первую подзадачу прямо над списком. **Предложение:** прятать полосу, когда виден список подзадач; «Start focus» — в строку первой подзадачи. Риск низкий.

Не смотрели вживую: Home (`/today` у тестового пользователя застревал на скелетоне), открытую цель, календарь, телефонные экраны.

## Что не сделано

- **Редактор документов** `PageWorkspace` (`/pages/[id]`, 4005 строк, 9 импортов shadcn): совместное редактирование и форматы v1/v2 — слишком рискованно до запуска.
- **Canvas мудборда** (`/moodboards/[id]?view=canvas`, `MoodboardWorkspace`).
- **`/admin/system`** (`SystemSettings`, `UserManagement`, `LogViewer`, общий `SettingsSection` с 14px): там формы секретов провайдеров входа.
- **`/setup` для первого пользователя** (`SetupForm`) и ветка `AppShell` без сессии в `(app)/layout.tsx`.
- **Account в настройках**: встраивает старый `settings/AccountSettings` (удаление аккаунта).
- **`/p/[token]`** (`PublicPageView`): общий с редактором рендер блоков.
- **`/style`** (витрина shadcn, только админ) — dev-инструмент, не трогал.
- 47 файлов needt3 используют иконки не из `react-icons/lu` (`Fi*`) — отдельная задача.

## Открытые вопросы

1. На странице бронирования появились видимые подписи «Name» / «Email» (колонка 105px по PORT §0.4). Раньше были только плейсхолдеры. Оставить?
2. На OAuth-согласии «Allow» стал основной кнопкой (`nx-btn-primary`, раньше вторичная), «Cancel» — текстовой. Так по правилу «одна основная кнопка на вид». Ок?
3. Кнопка «Cancel booking» теперь текстовая красная (`nx-btn-danger` по UI-RULES), а была красной заливкой. На экране это единственное действие — не слишком слабо?
4. В публичном мудборде заметки — 13px (хром), раньше 16px. Считаем ли заметку «документом» (16px)?
5. Порядок оставшегося: что из «Что не сделано» брать после 17.11 первым? Моё предложение: Account → `/admin/system` → `SetupForm` → canvas → редактор.
