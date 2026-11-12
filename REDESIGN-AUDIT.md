# Аудит редизайна: какие страницы ещё на старом UI

Ветка `feat/redesign-remaining`, 12.11.2026. Источник правил: `docs/handoff/PORT.md` §0, `docs/port/prototype/UI-RULES.md`.

**Старый UI** = shadcn из `src/components/ui/*`, иконки `lucide-react` / `react-icons/hi`, сырые цвета Tailwind (`bg-blue-600`, `text-green-600`), токены старой эпохи (`bg-card`, `text-muted-foreground`, `--button-primary-bg`), `text-sm`/`text-base` (14/16px в хроме).
**Новый UI** = компоненты `src/components/needt3/*`, классы `.nx-btn`, `.nt-input`, `SGroup`/`SRow`, admin-kit, иконки `react-icons/lu`, внутри области `.needt-v3`.

Статус: **NEW** — полностью новый; **MIXED** — новая рамка, старые куски; **OLD** — старый.
Размер переноса: S (<50 строк), M, L.

## 1. Приложение (вход нужен), `src/app/(app)/`

| URL | Файл страницы | Что рендерит | Статус | Что старое | Размер |
|---|---|---|---|---|---|
| `/today` | `(app)/today/page.tsx` | `needt3/home/HomeScreen` | NEW | — | — |
| `/calendar` | `(app)/calendar/page.tsx` | `needt3/calendar/CalendarCraft` | NEW | — | — |
| `/tasks`, `/projects`, `/projects/[id]` | `(app)/tasks/page.tsx`, `(app)/projects/**` | `needt3/work/WorkScreen` | NEW | — | — |
| `/pages` | `(app)/pages/page.tsx` | `needt3/phone/docs` `DocsFace` | NEW | — | — |
| `/pages/[id]` | `(app)/pages/[id]/page.tsx` | `DocumentFace` → `components/pages/PageWorkspace` (4005 строк) | MIXED | редактор: 9 импортов `ui/*`, lucide; хром уже needt3 | L (не трогаем, см. ниже) |
| `/moodboards` | `(app)/moodboards/page.tsx` | `MoodboardsRoute` | NEW | — | — |
| `/moodboards/[id]` | `(app)/moodboards/[id]/page.tsx` | `MoodboardRoute`; при `?view=canvas` — `moodboards/MoodboardWorkspace` | MIXED | canvas: `ui/button`, lucide | M |
| `/mail` | `(app)/mail/page.tsx` | `needt3/mail/MailFaces` | NEW | — | — |
| `/habits` | `(app)/habits/page.tsx` | `HabitsRoute` | NEW | — | — |
| `/goals` | `(app)/goals/page.tsx` | `GoalsScreen` | NEW | — | — |
| `/agents` | `(app)/agents/page.tsx` | `AgentsScreen` (за флагом) | NEW | — | — |
| `/connections`, `/shared`, `/templates`, `/trash` | `(app)/{…}/page.tsx` | `needt3/phone/places` | NEW | — | — |
| `/share` | `(app)/share/page.tsx` | `needt3/share/SharePage` | MIXED | `SharePage.tsx:7-8` — `ui/button`, `ui/needt-picker` | S |
| `/settings` | `(app)/settings/page.tsx` | `SettingsRedirect` → лист настроек (16 разделов needt3) | MIXED | раздел Account: `AccountSection.tsx:9,216` встраивает старый `settings/AccountSettings` (удаление аккаунта) | S–M |
| `/setup` | `(app)/setup/page.tsx` | вошёл: `OnboardingScreen` (NEW); не вошёл и нет пользователей: `setup/SetupForm` | MIXED | `page.tsx:36-39` `bg-background text-4xl`; `SetupForm.tsx` — `react-icons/hi`, 5×`ui/*`, `bg-green-50` | S–M |
| `/boards`, `/boards/[id]`, `/settings/waitlist` | редиректы | — | — | — | — |
| несуществующий URL | `(app)/[...missing]/page.tsx` | `NotFoundFace` | NEW | — | — |
| layout | `(app)/layout.tsx` | вошёл: `V3Root`; не вошёл: старый `layout/AppShell` | MIXED | ветка без сессии (`layout.tsx:71`) | S |

### Админка (`/admin/*`, только админ)

| URL | Файл | Что рендерит | Статус | Что старое | Размер |
|---|---|---|---|---|---|
| `/admin` | `(app)/admin/page.tsx` | `admin/OverviewScreen` | NEW | — | — |
| `/admin/users`, `/admin/users/[id]` | `(app)/admin/users/**` | `UsersScreen`, `UserDetailScreen` | NEW | — | — |
| `/admin/email` | `(app)/admin/email/page.tsx` | `EmailScreen` | NEW | — | — |
| `/admin/flags` | `(app)/admin/flags/page.tsx` | `FlagsScreen` | NEW | — | — |
| `/admin/operations` | `(app)/admin/operations/page.tsx` | `AdminPage` + инлайн-разметка | MIXED | `:5` lucide, `:8` `ui/button`, `bg-amber-500`/`bg-red-500`/`text-emerald-500`, `text-sm` | S |
| `/admin/system` | `(app)/admin/system/page.tsx` | `AdminPage` → `settings/SystemSettings`, `UserManagement`, `LogViewer/*` | OLD внутри новой рамки | `ui/input`, `ui/label`, `ui/card`, `ui/alert`, lucide; `SettingsSection.tsx` с `text-[14px]` | L (секреты провайдеров — высокий риск) |

## 2. Публичные страницы (без входа)

| URL | Файл | Что рендерит | Статус | Что старое | Размер |
|---|---|---|---|---|---|
| `/auth/signin`, `/auth/reset-password` | `(app)/auth/**` | `needt3/auth/*` | NEW | — | — |
| `/auth/confirm-email`, `/auth/desktop`, `/auth/desktop-complete` | `src/app/auth/**` | `needt3/auth/*` | NEW | — | — |
| `/start` | `src/app/start/page.tsx` | `onboarding/Ob3Flow` (грузит v3-стили) | NEW | — | — |
| `/desktop-quick-add` | `src/app/desktop-quick-add/page.tsx` | `needt3/desktop/DesktopQuickAdd` | NEW | — | — |
| `/oauth/authorize` | `src/app/oauth/authorize/page.tsx` | инлайн-карточка + `WorkspacePicker` | MIXED | `ui/button`, `bg-card`, `text-muted-foreground`, `ui/needt-picker` | M (форма согласия — поля не трогать) |
| `/oauth/logout/signing-out` | `src/app/oauth/logout/signing-out/page.tsx` | `SignOutAndReturn` | OLD | `ui/button`, `bg-card`, `text-muted-foreground` | S |
| `/book/[slug]` | `src/app/book/[slug]/page.tsx` | `BookingForm` | OLD | lucide, `ui/button`, `ui/input`, `bg-card shadow-lg`, `text-sm` | L |
| `/book/cancel/[token]` | `src/app/book/cancel/[token]/page.tsx` | `CancelBookingButton` | OLD | lucide, `ui/button`, `bg-card shadow-lg` | S |
| `/b/[id]/[token]` | `src/app/b/[id]/[token]/page.tsx` | инлайн-стили | OLD (без токенов) | `style={{maxWidth:1100…}}`, нет `.needt-v3` | M |
| `/p/[token]` | `src/app/p/[token]/page.tsx` | `pages/PublicPageView` | MIXED | lucide `FileText`, `text-sm`/`text-xs`; блоки редактора общие с приложением | M |
| `/privacy`, `/terms`, `/support`, `/subprocessors` | `src/app/{…}/page.tsx` | `legal/LegalDocument` | MIXED | `text-base`/`text-sm`, старые переменные | S–M (один файл на все четыре) |
| `/style` | `src/app/style/page.tsx` | `ui/design-system-lab` | OLD | витрина shadcn, только админ | не переносим (dev-инструмент) |
| `/style/v3-task` | `src/app/style/v3-task/page.tsx` | `needt3/task/TaskFixtures` | NEW | — | — |
| `/` | `src/app/page.tsx` | только редирект | — | — | — |

Границы ошибок: `src/app/error.tsx`, `src/app/not-found.tsx` — MIXED (`--button-primary-bg`, `text-4xl`); `src/app/p/[token]/not-found.tsx` — OLD (lucide, `text-sm`). `(app)/error.tsx` и `(app)/loading.tsx` — NEW.

## 3. Порядок переноса (меньший риск — раньше)

1. `/admin/operations` — S, только чтение.
2. `/share` — S, заменить `Button`/`NeedtPicker` на `.nx-btn` и `SSelect`.
3. `/oauth/logout/signing-out` + `/book/cancel/[token]` — S, карточка на `AuthScope`.
4. `src/app/not-found.tsx`, `src/app/error.tsx`, `p/[token]/not-found.tsx` — S.
5. Юридические страницы (`LegalDocument`) — S–M.
6. `/oauth/authorize` — M, только разметка.
7. `/b/[id]/[token]`, `/p/[token]` — M.
8. `/book/[slug]` (`BookingForm`) — L.
9. `/setup` (`SetupForm`), Account в настройках, ветка `AppShell` — S–M, но затрагивают регистрацию/удаление аккаунта.

**Сознательно не переносим в этой ветке** (риск выше пользы до запуска 17.11): редактор `PageWorkspace` (4005 строк, совместное редактирование, форматы v1/v2), canvas мудборда, `/admin/system` (секреты провайдеров, вход). Обоснование — в `FEATURE.md`.

## 4. Иконки

47 файлов needt3 (без тестов) импортируют иконки не из `react-icons/lu` (в основном `Fi*`, например `SettingsSheet.tsx:16`); `lucide-react` в needt3 нет. PORT.md §1 задаёт `react-icons/lu`. Это не «старая страница», а смешение наборов иконок; массовая замена — отдельная задача, в этой ветке не делается.
