## ADDED Requirements

### Requirement: Desktop split composition
At viewport widths of 1280px and above, Today SHALL place a flexible document column (minimum 620px) beside a timeline column of `clamp(260px, 22vw, 340px)`, to the right of the app sidebar. The document MUST remain primary and the timeline MUST stay narrow.

#### Scenario: Wide desktop
- **WHEN** Today is opened at 1280px or wider
- **THEN** the app sidebar is preserved
- **AND** the document takes the flexible remaining width, at least 620px
- **AND** the timeline width stays between 260px and 340px

#### Scenario: Very wide screen
- **WHEN** Today is opened at 2048px
- **THEN** the timeline does not exceed 340px
- **AND** the document has a centered readable measure while its click target spans the full pane

#### Scenario: Independent scrolling
- **WHEN** the user scrolls the document or the timeline
- **THEN** each scrolls on its own
- **AND** a hairline divider separates them over one continuous background

### Requirement: Desktop visual density
Desktop Today SHALL use a compact day header and flat, card-free task rows. Day title MUST be 48-56px, date 16-18px, section headings 26-30px, task title 17-19px, and task metadata 15-17px. The completion ring MUST be 20-22px inside a hit target of at least 40px.

#### Scenario: Header and content above the fold
- **WHEN** Today is shown on desktop
- **THEN** the centered day header uses the specified sizes
- **AND** useful content begins above the fold

#### Scenario: Task row appearance
- **WHEN** a task is shown in the document
- **THEN** it is flat typography on the shared canvas, not a boxed card
- **AND** its pointer target is at least 40px tall

#### Scenario: Prose scale
- **WHEN** prose is shown on desktop
- **THEN** it uses an 18px base size with a readable line height

### Requirement: One-day timeline
The right panel SHALL provide a 24-hour one-day timeline with date navigation, a current-time marker, an automatic useful scroll position, and clickable task blocks. It MUST share the selected day with the document.

#### Scenario: Initial position
- **WHEN** Today opens on the current day
- **THEN** the timeline scrolls to a useful position around the current time
- **AND** the current-time marker is visible

#### Scenario: Date change
- **WHEN** the user changes the selected date from either the document header or the timeline navigation
- **THEN** the document and timeline both update to that date together

#### Scenario: Task block click
- **WHEN** the user clicks a task block on the timeline
- **THEN** the task opens through the existing task editing flow

#### Scenario: Timeline density
- **WHEN** the timeline is shown
- **THEN** its header is 88-92px, hour rows are 72px, labels are 12px, and task blocks use 12-13px text
- **AND** no glow or blur is used

### Requirement: Tablet and mobile layout
Below the desktop breakpoint, Today SHALL show a single-column daily document with native-safe scrolling, usable bottom navigation, safe-area padding, and compact typography, with no horizontal overflow. The timeline MAY be hidden.

#### Scenario: Phone
- **WHEN** Today is opened at phone width
- **THEN** only the document column is shown
- **AND** the page does not scroll horizontally
- **AND** content clears the bottom navigation and device safe areas

#### Scenario: Tablet
- **WHEN** Today is opened at tablet width
- **THEN** the layout stays single-column and is not squeezed into two columns

#### Scenario: Phone header and typography
- **WHEN** the phone layout is shown
- **THEN** the phone day header and gestures are preserved
- **AND** the day title stays near 44px instead of the desktop size

### Requirement: Accessibility and motion
All controls SHALL have accessible names and keyboard focus. Touch targets on phone MUST be at least 44px. Reduced-motion preferences MUST be honored, and hydrating task or editor data MUST NOT cause a page-level layout jump.

#### Scenario: Keyboard use
- **WHEN** the user navigates with the keyboard
- **THEN** every control, including the completion ring, date and duration controls, and date navigation, is focusable and has an accessible name

#### Scenario: Phone touch targets
- **WHEN** Today is used on a phone
- **THEN** interactive controls have a target of at least 44px

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** task reordering and fades happen immediately
- **AND** no animation causes layout shift

#### Scenario: Hydration
- **WHEN** document and timeline data load
- **THEN** a stable skeleton occupies the final layout
- **AND** the page does not jump when content arrives

### Requirement: Workstream isolation
This change SHALL NOT alter the main Calendar screen or the app sidebar. Changes to the shared Task modal, global design tokens, or the task store MUST be made only when unavoidable and MUST remain backward-compatible.

#### Scenario: Calendar unchanged
- **WHEN** the Calendar screen and app sidebar are used after this change
- **THEN** their behavior and appearance are unchanged

#### Scenario: Shared component change
- **WHEN** a shared component or token must change to support Today
- **THEN** existing consumers behave as before
