//! The native application menu.
//!
//! Every custom item routes to something the web app already has (its routes,
//! the composer, the sidebar, the command palette) through `send_command`; the
//! page decides what that means. Standard items (Edit, Window, Hide, Full
//! screen) are the operating system's own.

use serde_json::json;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle,
};
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://needt.app";

/// A menu item with an accelerator; if the accelerator does not parse, the
/// item is still made, without it. A bad shortcut must never stop the app.
fn item(
    app: &AppHandle,
    id: &str,
    text: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, text, true, accelerator)
        .or_else(|_| MenuItem::with_id(app, id, text, true, None::<&str>))
}

pub fn build(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    #[cfg(target_os = "macos")]
    {
        let about = PredefinedMenuItem::about(app, Some("About Needt"), None)?;
        let settings = item(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?;
        let hide = PredefinedMenuItem::hide(app, None)?;
        let hide_others = PredefinedMenuItem::hide_others(app, None)?;
        let show_all = PredefinedMenuItem::show_all(app, None)?;
        let quit = item(app, "quit", "Quit Needt", Some("CmdOrCtrl+Q"))?;
        let sep1 = PredefinedMenuItem::separator(app)?;
        let sep2 = PredefinedMenuItem::separator(app)?;
        let sep3 = PredefinedMenuItem::separator(app)?;
        let app_menu = Submenu::with_items(
            app,
            "Needt",
            true,
            &[
                &about, &sep1, &settings, &sep2, &hide, &hide_others, &show_all, &sep3, &quit,
            ],
        )?;
        menu.append(&app_menu)?;
    }

    let new_task = item(app, "new-task", "New Task", Some("CmdOrCtrl+N"))?;
    let new_doc = item(app, "new-doc", "New Doc", Some("CmdOrCtrl+Alt+N"))?;
    let quick_add = item(app, "quick-add", "Quick Add", Some("CmdOrCtrl+Shift+Space"))?;
    let file_sep = PredefinedMenuItem::separator(app)?;
    let close = PredefinedMenuItem::close_window(app, None)?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[&new_task, &new_doc, &quick_add, &file_sep, &close],
    )?;
    #[cfg(not(target_os = "macos"))]
    {
        // Windows has no application menu: Settings and Quit live in File.
        let settings = item(app, "settings", "Settings", Some("CmdOrCtrl+,"))?;
        let quit = item(app, "quit", "Quit Needt", None)?;
        file.append(&PredefinedMenuItem::separator(app)?)?;
        file.append(&settings)?;
        file.append(&quit)?;
    }
    menu.append(&file)?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    menu.append(&edit)?;

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item(app, "today", "Today", Some("CmdOrCtrl+1"))?,
            &item(app, "calendar", "Calendar", Some("CmdOrCtrl+2"))?,
            &item(app, "tasks", "Tasks", Some("CmdOrCtrl+3"))?,
            &item(app, "docs", "Docs", Some("CmdOrCtrl+4"))?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "toggle-sidebar", "Toggle Sidebar", Some("CmdOrCtrl+Backslash"))?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "reload", "Reload", Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;
    menu.append(&view)?;

    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
        ],
    )?;
    menu.append(&window)?;

    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[&item(app, "help-site", "Needt Website", None)?],
    )?;
    menu.append(&help)?;

    Ok(menu)
}

/// A menu choice. Ids of the tray menu start with `tray-` and are not ours.
pub fn handle(app: &AppHandle, id: &str) {
    match id {
        "new-task" => crate::send_command(app, json!({ "type": "new-task" })),
        "new-doc" => crate::send_command(app, json!({ "type": "new-doc" })),
        "settings" => crate::send_command(app, json!({ "type": "settings" })),
        "today" => crate::send_command(app, json!({ "type": "navigate", "path": "/today" })),
        "calendar" => crate::send_command(app, json!({ "type": "navigate", "path": "/calendar" })),
        "tasks" => crate::send_command(app, json!({ "type": "navigate", "path": "/tasks" })),
        "docs" => crate::send_command(app, json!({ "type": "navigate", "path": "/pages" })),
        "toggle-sidebar" => crate::send_command(app, json!({ "type": "toggle-sidebar" })),
        "quick-add" => crate::show_quick_add(app),
        "reload" => crate::reload_main(app),
        "help-site" => {
            let _ = app.opener().open_url(SITE, None::<&str>);
        }
        "quit" => app.exit(0),
        _ => {}
    }
}
