## ADDED Requirements

### Requirement: Borderless daily canvas
The document side of Today SHALL behave as one borderless, full-height editable canvas, and the full pane MUST be a click target that places the caret. Prose, headings, lists, checklists, and dividers MUST be saved per selected date.

#### Scenario: Click unused space
- **WHEN** the user clicks empty space anywhere in the document pane
- **THEN** the caret is placed in the document
- **AND** the user can type immediately without a separate input box or card boundary

#### Scenario: Autosave per date
- **WHEN** the user writes prose, a heading, a list, a checklist, or a divider on a selected day
- **THEN** the content is saved for that date only
- **AND** a quiet saving/saved state is shown

### Requirement: Canonical task reference blocks
Task blocks embedded in the document SHALL reference a canonical task by its ID only. Completion, title, date, duration, and edit state MUST always render from the live task data, never from copied document content.

#### Scenario: Stored form carries only the ID
- **WHEN** a task block is saved in a day's document
- **THEN** the stored content is `<div data-type="taskReference" data-task-id="TASK_ID"></div>`
- **AND** no title, date, duration, or completion value is persisted in the document

#### Scenario: Task changes elsewhere
- **WHEN** a referenced task is renamed, rescheduled, or completed in another surface such as the Calendar
- **THEN** the block in the document shows the updated values without editing the document

#### Scenario: Unknown markup is rejected
- **WHEN** saved document content contains tags or attributes other than the exact task-reference element and its attributes beyond the existing allowed set
- **THEN** the unknown markup is stripped on save
- **AND** the task-reference element with its task ID is preserved

### Requirement: Task block interactions
Interactions on a task block SHALL act on the canonical task. Clicking the title MUST open the existing Edit Task modal, clicking the date or duration MUST open the shared date and duration picker, and clicking the completion ring MUST complete or reopen the task without opening the modal.

#### Scenario: Open from title
- **WHEN** the user clicks a task block's title
- **THEN** the existing Edit Task modal opens for that task

#### Scenario: Edit date or duration inline
- **WHEN** the user clicks a task block's date or duration
- **THEN** the shared picker opens
- **AND** the chosen value is applied to the canonical task

#### Scenario: Complete from the ring
- **WHEN** the user clicks the completion ring
- **THEN** the task is completed, or reopened if already complete
- **AND** the Edit Task modal does not open

### Requirement: Slash task creation
Typing `/task <title>` and pressing Enter SHALL create exactly one task using the selected day's defaults and replace the command line with a task block at the same document position. A failed creation MUST NOT lose the title and MUST offer a retry that does not create duplicates.

#### Scenario: Successful creation
- **WHEN** the user types `/task Prepare report` and presses Enter
- **THEN** one task titled "Prepare report" is created for the selected day
- **AND** the typed line is replaced by a task block at the same position among the surrounding prose

#### Scenario: Creation fails
- **WHEN** task creation fails
- **THEN** the typed title remains recoverable in the document
- **AND** a retry is offered that creates the task only once, even if retried repeatedly

### Requirement: Day history and switching
Switching days SHALL flush or queue any pending edit for the day being left before the next day's document loads, and MUST load that date's own document. The previous day's content MUST NOT be visible while the new day loads, and completed task references MUST be kept on historical days.

#### Scenario: Switch with unsaved edits
- **WHEN** the user edits a day and immediately navigates to another day
- **THEN** the pending edit is saved to the day it was written on
- **AND** returning to that day shows the edit

#### Scenario: Loading the next day
- **WHEN** a different date is selected
- **THEN** the editor is disabled and shows a loading state until the selected day's document is ready
- **AND** no content from the previous day appears

#### Scenario: Late response for an old date
- **WHEN** a load response arrives for a date that is no longer selected
- **THEN** it is ignored and does not replace the current day's document

#### Scenario: Historical completion
- **WHEN** the user views a past day containing completed task references
- **THEN** the completed tasks remain in that day's document, shown as complete

### Requirement: Reconciliation of task references
The document SHALL stay consistent with canonical tasks. A selected-day task that is not yet referenced MUST be added once to the generated task section, and duplicate references to the same task in one day MUST collapse deterministically. An incomplete task moved away from a day MUST be removed from that day's generated section, and explicit prose MUST NOT be rewritten.

#### Scenario: New task for the day
- **WHEN** a task scheduled for the selected day has no reference in that day's document
- **THEN** exactly one reference to it is appended to the generated task section

#### Scenario: Duplicate references
- **WHEN** a day's document contains several references to the same task
- **THEN** they collapse to one reference in a deterministic way

#### Scenario: Task moved away
- **WHEN** an incomplete task is moved to a different day
- **THEN** its reference is removed from the original day's generated section
- **AND** the user's written prose on that day is unchanged

#### Scenario: Deleting a block
- **WHEN** the user deletes a task block from the document
- **THEN** only the reference is removed
- **AND** the canonical task still exists

### Requirement: Persistence and failure handling
Document content SHALL remain backward-compatible with existing stored days, requiring no data migration. Each save MUST be tied to the date it was created for, and server validation MUST stay per-user, date-keyed, size-limited, and sanitized. On failure, local content MUST be retained and a late server response MUST NOT overwrite newer local edits.

#### Scenario: Existing days
- **WHEN** a day stored before this change is opened
- **THEN** its content is shown intact with no migration step

#### Scenario: Save fails or device offline
- **WHEN** saving fails or the device is offline
- **THEN** the editor keeps the local content
- **AND** an error state with a retry control is shown

#### Scenario: Late response after newer edit
- **WHEN** a slower earlier save or load response returns after the user made newer edits
- **THEN** the newer local edits are kept and not overwritten

#### Scenario: Oversized or hostile content
- **WHEN** content exceeds the size limit or contains disallowed markup
- **THEN** the save is rejected or sanitized per the validation rules

### Requirement: Document states and themes
Loading, empty, saving, saved, error, offline/retry, and partial-task-load states SHALL be legible in both light and dark themes using existing design tokens, without glow, blur, or a second surface color.

#### Scenario: Empty day
- **WHEN** a day has no content
- **THEN** an editable placeholder is shown, optionally with a short `/task` hint
- **AND** no large empty-state illustration appears

#### Scenario: Saved indicator
- **WHEN** a save completes
- **THEN** a quiet "Saved" state is shown that fades visually
- **AND** it remains available to assistive technology

#### Scenario: Task unavailable
- **WHEN** a referenced task cannot be loaded
- **THEN** a compact unavailable row with retry is shown at the same position
- **AND** the reference is not deleted from the document

#### Scenario: Both themes
- **WHEN** any state is shown in light or dark theme
- **THEN** text and controls are legible using existing tokens only
