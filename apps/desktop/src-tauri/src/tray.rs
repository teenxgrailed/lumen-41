//! The menu-bar / system-tray icon and its menu.
//!
//! The menu is rebuilt from what the web app reports (`needt-tray-state`, sent
//! by DesktopBridge about once a minute and whenever it changes): a running
//! focus session, today's next tasks with their time, and the open count that
//! also becomes the Dock badge on macOS. Choosing a task opens it in the app.

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
const MAX_TITLE: usize = 60;

#[derive(Deserialize, Default, Clone)]
pub struct TrayTask {
    id: String,
    title: String,
    #[serde(default)]
    time: Option<String>,
}

/// What the web app sends. Everything is optional so an older page cannot
/// break the menu.
#[derive(Deserialize, Default, Clone)]
pub struct TrayState {
    #[serde(default)]
    open: u32,
    #[serde(default)]
    next: Vec<TrayTask>,
    #[serde(default)]
    focus: Option<String>,
}

/// One line of plain text: no control characters, bounded length.
fn clean(text: &str, max: usize) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn item(app: &AppHandle, id: &str, text: &str, enabled: bool) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, text, enabled, None::<&str>)
}

fn build_menu(app: &AppHandle, state: &TrayState) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    if let Some(focus) = state.focus.as_deref().map(|f| clean(f, MAX_TITLE)) {
        if !focus.is_empty() {
            menu.append(&item(app, "tray-focus", &focus, false)?)?;
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
        let header = format!("Today, {} open", state.open);
        menu.append(&item(app, "tray-header", &header, false)?)?;
        for task in tasks {
            let title = clean(&task.title, MAX_TITLE);
            let label = match task.time.as_deref().map(|t| clean(t, 5)) {
                Some(time) if !time.is_empty() => format!("{time}  {title}"),
                _ => title,
            };
            let id = format!("{TASK_PREFIX}{}", task.id);
            menu.append(&item(app, &id, &label, true)?)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    menu.append(&item(app, "tray-open", "Open Needt", true)?)?;
    menu.append(&item(app, "tray-quick", "Quick add", true)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item(app, "tray-quit", "Quit Needt", true)?)?;
    Ok(menu)
}

/// Tray menu choices. Ids from the app menu never start with `tray-`.
fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "tray-open" => crate::show_main(app),
        "tray-quick" => crate::show_quick_add(app),
        "tray-quit" => app.exit(0),
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
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(include_image!("icons/64x64.png"))
        .tooltip("Needt")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Applies a state from the web app: the menu, the tooltip and the Dock badge.
pub fn update(app: &AppHandle, state: TrayState) {
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
            let badge = if state.open > 0 {
                Some(i64::from(state.open))
            } else {
                None
            };
            let _ = main.set_badge_count(badge);
        }
    }
}
