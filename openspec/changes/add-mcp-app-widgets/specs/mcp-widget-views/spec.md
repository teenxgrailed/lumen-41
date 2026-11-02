## ADDED Requirements

### Requirement: Task list view

The task list view SHALL render the tasks returned by `needt_view_tasks` as rows with a tick control, and SHALL complete or reopen a task by calling `needt_complete_task` through the host.

#### Scenario: Tick a task
- **WHEN** the person ticks an open task in the view
- **THEN** the row shows as done at once, `needt_complete_task` is called with that task id, the workspace id of the result and `done: true`, and the row settles to the state the call returned

#### Scenario: Untick a task
- **WHEN** the person unticks a done task
- **THEN** the view calls `needt_complete_task` with `done: false` and shows the row open

#### Scenario: Call fails
- **WHEN** the call returns an error or the host refuses it
- **THEN** the row returns to its previous state and a one-line message states the reason in plain words, without a stack or an id

#### Scenario: Read-only connection
- **WHEN** the call is refused for missing scope
- **THEN** the row returns to its previous state and the message says the connection can read but not change tasks

#### Scenario: Rate limited
- **WHEN** the call returns `RATE_LIMITED` with `retryAfterSeconds`
- **THEN** the row returns to its previous state and the message says to retry in that many seconds

#### Scenario: Undo
- **WHEN** a tick succeeds and the result carries an `actionId`
- **THEN** the view offers Undo for 8 seconds, and choosing it calls `needt_undo` with that `actionId` and restores the row

#### Scenario: Empty list
- **WHEN** the result has no tasks
- **THEN** the view shows one line saying there is nothing to show and no controls

#### Scenario: Long list
- **WHEN** the result has more than 8 tasks
- **THEN** the first 8 rows are shown with a "Show more" control that states how many rows are hidden, and no count is shown while all rows are visible

### Requirement: Today view

The Today view SHALL show the events and tasks returned by `needt_view_today` for one day, ordered by start time, with the remaining task time summed in the header.

#### Scenario: Day with events and tasks
- **WHEN** the result has events and scheduled tasks for the day
- **THEN** they are listed in time order in one list, events and tasks are visually distinct by the same carriers as the app's `row` layout, and the header shows the day and the sum of the remaining task durations

#### Scenario: Tasks only in a shared workspace
- **WHEN** the result has a `note` that events are personal
- **THEN** only tasks are listed and the note is shown as secondary text

#### Scenario: Now marker
- **WHEN** the day shown is today in the person's time zone
- **THEN** a now-line mark sits at the current time between the rows it falls between

#### Scenario: Tick in Today
- **WHEN** the person ticks a task in this view
- **THEN** the same tick, error, rate-limit and undo behaviour as the task list view applies

### Requirement: Project progress view

The project progress view SHALL show a project's name, done and total task counts as a progress bar, and the next open tasks, from `needt_view_project`.

#### Scenario: Project with progress
- **WHEN** the result has a project with 7 done of 10 tasks
- **THEN** the view shows the project tile and name, a bar filled to 70% and the text "7 of 10"

#### Scenario: Overdue tasks
- **WHEN** the result counts overdue tasks
- **THEN** only the overdue rows and their count are marked at-risk, and nothing else on the view uses the at-risk colour

#### Scenario: Project with no tasks
- **WHEN** the project has no tasks
- **THEN** the view shows the name and a single line saying it has no tasks, with no bar

### Requirement: Text, never markup

Every string from a tool result SHALL be inserted into the view as text. No title, name, note or label SHALL be interpreted as HTML, script or a URL.

#### Scenario: Hostile title
- **WHEN** a task title is `<img src=x onerror=alert(1)>`
- **THEN** the view shows that exact text in the row and no element or handler is created from it

### Requirement: Design rules of the product

The views SHALL follow the product's design authority: every grey is the text colour at a ladder alpha, the chrome uses only 13px and 12px type, the accent is never a solid fill on a button or surface, controls and rows use a 32px geometry, and elevation is a hairline ring on a shifted ground with no shadow.

#### Scenario: Colours come from tokens
- **WHEN** the generated CSS of a view is scanned
- **THEN** every colour is a token reference or a ladder alpha of the foreground, and no literal hex grey appears outside the token block

#### Scenario: Token block matches the design system
- **WHEN** the token test runs
- **THEN** every value in the views' token block equals the value in `needt-ds-tokens.css` and `needt-themes.css` for the same name, and the test fails on any difference

#### Scenario: Type scale
- **WHEN** the generated CSS is scanned for `font-size`
- **THEN** the chrome sizes are only 13px and 12px, the day heading is 16px, and 14px does not appear

#### Scenario: No solid accent on controls
- **WHEN** the generated CSS is scanned
- **THEN** no button, tick or "Show more" control has a solid accent `background`; the accent appears on text, rings at a ladder alpha, the now-line and progress marks only

#### Scenario: No tally of visible rows
- **WHEN** a list shows all of its rows
- **THEN** no count of those rows is displayed above them

### Requirement: Self-contained and themed

A view SHALL work with no network, SHALL use a system font stack with no remote font, and SHALL follow the host's light or dark theme, falling back to the operating system preference when the host sends none.

#### Scenario: Dark host
- **WHEN** the host context says the theme is dark
- **THEN** the view uses the dark token set before first paint of content

#### Scenario: No theme from host
- **WHEN** the host sends no theme
- **THEN** the view follows `prefers-color-scheme`

#### Scenario: Fonts
- **WHEN** Inter is not installed on the device
- **THEN** the view renders in the system font and nothing is fetched

### Requirement: Motion

When a row changes state, only that row SHALL animate, with a rise-and-settle of 0.42s. No other row SHALL move, no list reflow SHALL animate, and no spring SHALL be used. Under `prefers-reduced-motion` nothing SHALL animate.

#### Scenario: One row moves
- **WHEN** a task is ticked in a list of ten rows
- **THEN** only the ticked row animates and the other nine rows keep their positions

#### Scenario: Reduced motion
- **WHEN** the operating system asks for reduced motion
- **THEN** the row changes state with no animation

### Requirement: Degrades without the host protocol

If the view never receives a `ui/initialize` answer or a tool result, it SHALL show a single neutral line and no controls, and SHALL NOT throw.

#### Scenario: Host never answers
- **WHEN** no answer to `ui/initialize` arrives within 5 seconds
- **THEN** the view shows one line saying the content could not be loaded and renders no tick controls

#### Scenario: Malformed result
- **WHEN** the tool result text is not valid JSON
- **THEN** the view shows the same one line and logs nothing that includes the result text
