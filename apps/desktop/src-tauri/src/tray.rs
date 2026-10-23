//! The menu-bar / system-tray icon and its menu (spec: additions-2/desktop-chrome).
//!
//! The icon is the "n" template mark alone. While a focus session runs it also
//! carries the time left (mm:ss, ticking here, once a second, from the end time
//! the web app reports; macOS shows a tray title, Windows has none).
//!
//! The menu is rebuilt from what the web app reports (`needt-tray-state`, sent
//! by DesktopBridge about once a minute and whenever it changes): the running
//! focus session, today's next tasks with their time, and the overdue count
//! that becomes the Dock badge on macOS (overdue only: red means "needs you
//! now", hidden at 0). Choosing a task opens it in the app.
//!
//! A native menu cannot be given a width. The spec's menu is 330 px wide and
//! its long rows end in an ellipsis, so every row is cut to a character budget
//! that is about 330 px of the system menu font (`MENU_CHARS`).

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{
    include_image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

const TRAY_ID: &str = "main";
const TASK_PREFIX: &str = "tray-task:";
const MAX_TASKS: usize = 3;
/// About 330 px of the 13 px system menu font, padding and key column included.
const MENU_CHARS: usize = 42;
/// What a task row can spend on its title once the time column is paid for.
const TIME_COLUMN_CHARS: usize = 7;

#[derive(Deserialize, Default, Clone)]
pub struct TrayTask {
    id: String,
    title: String,
    #[serde(default)]
    time: Option<String>,
}

/// A running focus session, as the web app reports it.
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FocusRun {
    /// "Focus" or "Break".
    #[serde(default)]
    kind: String,
    #[serde(default)]
    title: String,
    /// Epoch milliseconds the planned time runs out; null when paused or open-ended.
    #[serde(default)]
    ends_at: Option<i64>,
    /// Seconds left while paused.
    #[serde(default)]
    left_sec: Option<i64>,
    #[serde(default)]
    total_sec: Option<i64>,
    #[serde(default)]
    paused: bool,
}

/// What the web app sends. Everything is optional so an older page cannot
/// break the menu.
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    /// Today's open tasks plus the overdue ones (the menu header).
    #[serde(default)]
    open: u32,
    /// The overdue ones alone: the Dock badge.
    #[serde(default)]
    overdue: u32,
    #[serde(default)]
    next: Vec<TrayTask>,
    /// The focus session in words (older pages send only this).
    #[serde(default)]
    focus: Option<String>,
    #[serde(default)]
    focus_run: Option<FocusRun>,
}

/// The countdown the tray title shows, kept for the one-second ticker.
#[derive(Clone, Copy)]
struct ClockSpec {
    ends_at: Option<i64>,
    paused_left: Option<i64>,
}

#[derive(Default)]
pub struct FocusClock(Mutex<Option<ClockSpec>>);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn spec_of(run: &FocusRun) -> Option<ClockSpec> {
    if run.paused {
        run.left_sec.map(|left| ClockSpec {
            ends_at: None,
            paused_left: Some(left),
        })
    } else {
        run.ends_at.map(|end| ClockSpec {
            ends_at: Some(end),
            paused_left: None,
        })
    }
}

/// Whole seconds left (rounded up, so the last second reads 0:01).
fn left_secs(spec: ClockSpec) -> Option<i64> {
    match (spec.paused_left, spec.ends_at) {
        (Some(left), _) => Some(left.max(0)),
        (None, Some(end)) => Some(((end - now_ms() + 999) / 1000).max(0)),
        _ => None,
    }
}

/// "18:42", "60:00", "90:00": minutes are not wrapped into hours.
fn clock(secs: i64) -> String {
    format!("{}:{:02}", secs / 60, secs % 60)
}

/// One line of plain text: no control characters, cut to `max` characters with
/// an ellipsis when it is longer.
fn fit(text: &str, max: usize) -> String {
    let one: String = text.chars().filter(|c| !c.is_control()).collect();
    let one = one.trim();
    if one.chars().count() <= max {
        return one.to_string();
    }
    let cut: String = one.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", cut.trim_end())
}

pub(crate) fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// A menu item; the key hint is dropped (not the item) if the accelerator does
/// not parse, so a bad hint can never empty the menu.
fn item(
    app: &AppHandle,
    id: &str,
    text: &str,
    enabled: bool,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    if let Some(keys) = accelerator {
        if let Ok(with_keys) = MenuItem::with_id(app, id, text, enabled, Some(keys)) {
            return Ok(with_keys);
        }
    }
    MenuItem::with_id(app, id, text, enabled, None::<&str>)
}

fn build_menu(app: &AppHandle, state: &TrayState) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    // A running focus session leads the menu (Pause, End), as in the spec.
    let running = state.focus_run.as_ref();
    if let Some(run) = running {
        let kind = if run.kind == "Break" { "Break" } else { "Focus" };
        let title = clean_title(run);
        let head = if title.is_empty() {
            kind.to_string()
        } else {
            format!("{kind} · {title}")
        };
        menu.append(&item(app, "tray-focus", &fit(&head, MENU_CHARS), false, None)?)?;
        if let Some(left) = spec_of(run).and_then(left_secs) {
            let line = match run.total_sec {
                Some(total) if total > 0 => format!("{} left of {}", clock(left), clock(total)),
                _ => format!("{} left", clock(left)),
            };
            menu.append(&item(app, "tray-focus-left", &line, false, None)?)?;
        }
        let toggle = if run.paused { "Resume focus" } else { "Pause focus" };
        menu.append(&item(app, "tray-focus-toggle", toggle, true, None)?)?;
        menu.append(&item(
            app,
            "tray-focus-end",
            "End focus",
            true,
            Some("CmdOrCtrl+."),
        )?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    } else if let Some(line) = state.focus.as_deref().map(|f| fit(f, MENU_CHARS)) {
        // An older page: the one line it sends.
        if !line.is_empty() {
            menu.append(&item(app, "tray-focus", &line, false, None)?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
    }

    let tasks: Vec<&TrayTask> = state
        .next
        .iter()
        .filter(|task| valid_id(&task.id))
        .take(MAX_TASKS)
        .collect();
    if !tasks.is_empty() {
        let header = format!("Today · {} open", state.open);
        menu.append(&item(app, "tray-header", &header, false, None)?)?;
        for task in tasks {
            let time = task
                .time
                .as_deref()
                .map(|t| fit(t, 5))
                .filter(|t| !t.is_empty());
            let label = match time {
                Some(time) => format!(
                    "{time}  {}",
                    fit(&task.title, MENU_CHARS - TIME_COLUMN_CHARS)
                ),
                None => fit(&task.title, MENU_CHARS),
            };
            let id = format!("{TASK_PREFIX}{}", task.id);
            menu.append(&item(app, &id, &label, true, None)?)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    menu.append(&item(app, "tray-open", "Open Needt", true, Some("CmdOrCtrl+O"))?)?;
    menu.append(&item(
        app,
        "tray-quick",
        "Quick add",
        true,
        Some("CmdOrCtrl+Shift+Space"),
    )?)?;
    if running.is_none() {
        menu.append(&item(
            app,
            "tray-focus-start",
            "Start focus on next task",
            true,
            None,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item(app, "tray-quit", "Quit Needt", true, Some("CmdOrCtrl+Q"))?)?;
    Ok(menu)
}

fn clean_title(run: &FocusRun) -> String {
    run.title
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .to_string()
}

/// Tray menu choices. Ids from the app menu never start with `tray-`.
fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "tray-open" => crate::show_main(app),
        "tray-quick" => crate::show_quick_add(app),
        "tray-quit" => app.exit(0),
        // Focus controls act without pulling the window forward.
        "tray-focus-toggle" => {
            crate::send_command_quiet(app, serde_json::json!({ "type": "focus-toggle" }))
        }
        "tray-focus-end" => {
            crate::send_command_quiet(app, serde_json::json!({ "type": "focus-end" }))
        }
        "tray-focus-start" => {
            crate::send_command_quiet(app, serde_json::json!({ "type": "focus-start-next" }))
        }
        _ => {
            if let Some(task) = id.strip_prefix(TASK_PREFIX) {
                if valid_id(task) {
                    crate::send_command(
                        app,
                        serde_json::json!({ "type": "open-task", "id": task }),
                    );
                }
            }
        }
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &TrayState::default())?;
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Needt")
        .menu(&menu)
        // macOS: a click opens the menu, as a menu-bar item does. Windows: a
        // left click opens the app and the right click the menu.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::show_main(tray.app_handle());
            }
        });
    // macOS: the "n" template mark alone (the system tints it for light, dark
    // and a highlighted menu bar). Windows has no template images: the app icon.
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(include_image!("icons/tray-template.png"))
        .icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.icon(include_image!("icons/64x64.png"));
    builder.build(app)?;
    start_ticker(app.clone());
    Ok(())
}

/// Once a second: the countdown next to the icon while a focus runs, nothing
/// otherwise. Only touches the tray when the text changes.
fn start_ticker(app: AppHandle) {
    std::thread::spawn(move || {
        let mut shown: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let spec = app
                .state::<FocusClock>()
                .0
                .lock()
                .ok()
                .and_then(|guard| *guard);
            let text = spec.and_then(left_secs).map(clock);
            if text != shown {
                if let Some(tray) = app.tray_by_id(TRAY_ID) {
                    let _ = tray.set_title(text.as_deref());
                }
                shown = text;
            }
        }
    });
}

/// Applies a state from the web app: the menu, the tooltip, the countdown and
/// the Dock badge (overdue only).
pub fn update(app: &AppHandle, state: TrayState) {
    let spec = state.focus_run.as_ref().and_then(spec_of);
    if let Ok(mut guard) = app.state::<FocusClock>().0.lock() {
        *guard = spec;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_menu(app, &state) {
            let _ = tray.set_menu(Some(menu));
        }
        let tooltip = if state.open > 0 {
            format!("Needt, {} open today", state.open)
        } else {
            "Needt".to_string()
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(main) = app.get_webview_window("main") {
            let badge = if state.overdue > 0 {
                Some(i64::from(state.overdue))
            } else {
                None
            };
            let _ = main.set_badge_count(badge);
        }
    }
}
