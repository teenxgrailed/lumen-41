## ADDED Requirements

### Requirement: Learn behind a flag

Learn SHALL exist only for accounts with the `learn_module` flag on. The flag SHALL be off for everybody until the owner turns it on in production.

#### Scenario: Flag off
- **WHEN** the flag is off for the account
- **THEN** no Learn row is shown, `/learn` returns 404 and `GET /api/learn/nav` returns `{ "enabled": false }`

### Requirement: Free sees a locked place

On Free the Learn row SHALL be grey with a PRO pill, SHALL NOT be hideable, and SHALL open a promo that shows no lesson content and reuses the `cn-promo*` pattern. Pro buttons SHALL be hidden in store builds.

#### Scenario: Free opens Learn
- **WHEN** a Free account opens `/learn`
- **THEN** the promo shows and the daily free lesson is offered inside it (see Free limit)

#### Scenario: Free cannot hide the row
- **WHEN** a Free account has `prefs.learnInSidebar = false`
- **THEN** the row is still shown

### Requirement: Pro place and promo

On Pro the row SHALL be a normal row after Agents (phone: before Settings), hideable by `prefs.learnInSidebar`; the first visit SHALL show the promo with an Open button that works at once; the seen flag SHALL be stored on the account.

#### Scenario: Hide the row
- **WHEN** a Pro account turns the switch off
- **THEN** the row disappears and `/learn` still opens by URL

### Requirement: Courses in any language

A person SHALL be able to create a course for any language pair through AI, choosing a goal and a level at onboarding. Curated starter decks SHALL exist for EN, DE, ES, FR and UK.

#### Scenario: Create a course
- **WHEN** a Pro person asks for Portuguese from Russian at level A2
- **THEN** a course is created with that pair, level and goal and the first lesson is generated and validated

#### Scenario: Import from a Learn page
- **WHEN** the person picks an existing "Needt · Learn · <topic>" page to continue from
- **THEN** a course is created with the page's level and next step and the page is not modified

### Requirement: Lessons use typed answers and choices

A lesson SHALL consist of exercises of type `choice` and `type`. The exercise schema SHALL reserve a `voice` type that is rejected as disabled in v1. Answers SHALL be checked deterministically against accepted variants generated with the lesson, with no AI call per answer.

#### Scenario: Typed answer with variant
- **WHEN** the person types an accepted variant with different case or surrounding spaces
- **THEN** the answer is correct

#### Scenario: Voice exercise
- **WHEN** a generated lesson contains a `voice` exercise
- **THEN** the lesson fails validation with `block_disabled`

### Requirement: Spaced repetition

Cards SHALL be scheduled with FSRS (`ts-fsrs`). Wrong answers SHALL be re-queued within the same lesson and SHALL appear in a mistakes review.

#### Scenario: Wrong answer returns
- **WHEN** a card is answered wrong
- **THEN** it appears again later in the same lesson and is listed in the mistakes review

#### Scenario: Due reviews
- **WHEN** a new lesson is built
- **THEN** it includes cards whose FSRS due time has passed before new cards beyond the daily limit

### Requirement: XP, daily goal and streak are separate

XP SHALL accumulate per lesson and day. The daily goal SHALL be a chosen XP target. The streak SHALL count days on which the goal was met or a freeze was spent, and SHALL be a Needt habit using the existing streak maths. A course SHALL own one habit whose completion is written when the goal is met.

#### Scenario: Goal met
- **WHEN** the day's XP reaches the daily goal
- **THEN** a habit completion is written for that day and the streak increases

#### Scenario: Lesson without goal
- **WHEN** a lesson finishes below the daily goal
- **THEN** XP is saved and the streak is unchanged

#### Scenario: Freeze
- **WHEN** a day is missed and a freeze is available
- **THEN** one freeze is consumed and the streak continues

### Requirement: Lessons are placed in the calendar

The course habit SHALL be scheduled by the scheduler like any habit, from the time and days chosen at onboarding, and SHALL appear on Today.

#### Scenario: Slot placed
- **WHEN** a course is created with 18:00 on weekdays
- **THEN** the scheduler places a lesson slot on each weekday and Today shows it

### Requirement: Free limit is lessons per day

Free SHALL be limited to one lesson per local day; Pro SHALL be unlimited. Practice inside a lesson SHALL NOT be gated, and the system SHALL NOT use hearts or energy.

#### Scenario: Second lesson on Free
- **WHEN** a Free account finishes a lesson and starts another the same day
- **THEN** the promo shows before the second lesson starts and no lesson is interrupted

#### Scenario: Mid-lesson
- **WHEN** a Free person is halfway through a lesson
- **THEN** no paywall or limit appears until the lesson ends

### Requirement: Free lesson source

The Free daily lesson SHALL NOT call AI generation against the account unless the owner decision on Free AI says so (design.md open decision a).

#### Scenario: Free generation
- **WHEN** a Free account starts its daily lesson
- **THEN** the lesson is taken from the cached pool and `AiUsage.actionCount` is unchanged

### Requirement: Lil Coo leads the lesson

The pigeon Lil Coo SHALL lead each lesson and react with the states `idle`, `think`, `correct`, `combo`, `wrong`, `tease`, `streak`, `levelUp`, `streakLost` and `nag`. Each reaction SHALL be readable without sound and last under 1.5 seconds. Until the animation file exists, static SVG poses SHALL stand in.

#### Scenario: Combo
- **WHEN** the person gives three correct answers in a row
- **THEN** Coo shows `combo` and the next question is not delayed beyond the reaction

#### Scenario: No answer
- **WHEN** five seconds pass with no answer
- **THEN** Coo shows `think`

#### Scenario: Missing animation
- **WHEN** the Rive file is not available
- **THEN** the matching static pose is shown and the lesson works

### Requirement: Lesson look

Lessons SHALL show one large card per question, a visible stack behind it, a thin progress bar with a timer where a round is timed, and an XP count-up on a correct answer. Accent SHALL NOT be a solid fill on any button; chrome SHALL use the 13px and 12px scale; motion SHALL be one rise-and-settle on the element that changed.

#### Scenario: Active card
- **WHEN** a card is active
- **THEN** it is marked by an outline or wash, not a solid accent fill

### Requirement: Clean recording mode

Learn SHALL offer a recording mode: a clean 9:16 view within TikTok safe zones, with no navigation, paywall, toasts or banners, one question per screen, fast auto-advance, a visible XP count-up and 60 fps as the target. It SHALL include a deterministic demo take (right, right, right, wrong, tease, combo, level-up) that uses no AI and no account data, and toggles for Coo size and sound.

#### Scenario: Demo take
- **WHEN** the demo seed is started twice
- **THEN** both runs show the same sequence of questions and reactions

#### Scenario: Clean screen
- **WHEN** recording mode is on and a toast would normally appear
- **THEN** the toast is suppressed

### Requirement: Events and reminders

Learn SHALL record `learn_lesson_started`, `learn_lesson_completed`, `learn_day1_return`, `learn_day7_return` and `learn_streak_7` through Umami, and SHALL send reminders through the existing `notify` facade and reminder paths.

#### Scenario: Streak seven
- **WHEN** a streak reaches seven days
- **THEN** `learn_streak_7` is recorded once for that streak

### Requirement: Out of scope in v1

Learn SHALL NOT include leagues, hearts, energy or voice practice in v1.

#### Scenario: Leagues
- **WHEN** a person uses Learn
- **THEN** no league, ranking or heart counter is shown
