//! Needt desktop shell.
//!
//! A thin native frame around the hosted web app. Windows load
//! https://use.needt.app directly; this crate adds only what a browser tab
//! cannot do: tray icon, a global quick-add shortcut, native notifications,
//! remembered window geometry and a single running instance.

use tauri::{
    include_image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_URL: &str = "https://use.needt.app";
const QUICK_ADD_PATH: &str = "quick-add";

/// Runs in every page of every window before the page's own scripts.
///
/// 1. Links that would open a new window (`target=_blank`, `window.open`) are
///    turned into plain navigations, so the navigation guard below decides
///    whether they stay in the app or go to the system browser.
/// 2. `window.Notification` is replaced by a shim over the Tauri notification
///    plugin: WKWebView has no Web Notifications, and this keeps the web
///    code unchanged. Resolved lazily because plugin globals may load later.
const INIT_JS: &str = r#"
(function () {
  if (window.__needtDesktop) return;
  window.__needtDesktop = true;

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
    if (a && a.href) { e.preventDefault(); window.location.href = a.href; }
  }, true);
  window.open = function (u) {
    if (u) { try { window.location.href = new URL(String(u), window.location.href).href; } catch (_) {} }
    return null;
  };

  var api = function () { return window.__TAURI__ && window.__TAURI__.notification; };
  var permission = 'default';
  function refresh() {
    var n = api();
    if (n && n.isPermissionGranted) {
      n.isPermissionGranted().then(function (ok) { if (ok) permission = 'granted'; }).catch(function () {});
    }
  }
  function NeedtNotification(title, options) {
    options = options || {};
    this.title = String(title);
    this.body = options.body || '';
    this.close = function () {};
    var n = api();
    if (n && n.sendNotification) n.sendNotification({ title: this.title, body: this.body });
  }
  Object.defineProperty(NeedtNotification, 'permission', { get: function () { return permission; } });
  NeedtNotification.requestPermission = function (cb) {
    var n = api();
    var p = n && n.requestPermission ? n.requestPermission() : Promise.resolve('denied');
    return p.then(function (r) {
      permission = r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'default';
      if (typeof cb === 'function') cb(permission);
      return permission;
    });
  };
  try { window.Notification = NeedtNotification; } catch (_) {}
  refresh();
  window.addEventListener('load', refresh);
})();
"#;

fn start_url() -> Url {
    if cfg!(debug_assertions) {
        if let Ok(value) = std::env::var("NEEDT_DESKTOP_URL") {
            if let Ok(url) = Url::parse(&value) {
                return url;
            }
        }
    }
    Url::parse(DEFAULT_URL).expect("default url is valid")
}

/// True for pages that belong in the app: needt.app and its subdomains over
/// https, the app's own bundled pages, and (debug only) the dev server.
fn is_internal(url: &Url, start: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => {
            let Some(host) = url.host_str() else {
                return false;
            };
            if host == "tauri.localhost" {
                return true;
            }
            if cfg!(debug_assertions)
                && start.host_str() == Some(host)
                && start.scheme() == url.scheme()
            {
                return true;
            }
            url.scheme() == "https" && (host == "needt.app" || host.ends_with(".needt.app"))
        }
        _ => false,
    }
}

/// Navigation guard: in-app for needt.app, system browser for everything else.
fn nav_guard(app: &AppHandle) -> impl Fn(&Url) -> bool + Send + 'static {
    let app = app.clone();
    let start = start_url();
    move |url: &Url| {
        if is_internal(url, &start) {
            return true;
        }
        if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
            let _ = app.opener().open_url(url.as_str(), None::<&str>);
        }
        false
    }
}

fn build_main(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start_url()))
        .title("Needt")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .initialization_script(INIT_JS)
        .on_navigation(nav_guard(app))
        .build()?;
    Ok(())
}

fn show_main(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(window) => {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        None => {
            let _ = build_main(app);
        }
    }
}

/// Small always-on-top window on the web app's own /quick-add page.
fn show_quick_add(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let Ok(url) = start_url().join(QUICK_ADD_PATH) else {
        return;
    };
    let _ = WebviewWindowBuilder::new(app, "quick", WebviewUrl::External(url))
        .title("Quick add")
        .inner_size(560.0, 380.0)
        .min_inner_size(400.0, 260.0)
        .center()
        .always_on_top(true)
        .initialization_script(INIT_JS)
        .on_navigation(nav_guard(app))
        .build();
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Needt", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Quick add", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Needt", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quick, &separator, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(include_image!("icons/64x64.png"))
        .tooltip("Needt")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quick" => show_quick_add(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let modifiers = if cfg!(target_os = "macos") {
        Modifiers::SUPER | Modifiers::SHIFT
    } else {
        Modifiers::CONTROL | Modifiers::SHIFT
    };
    let quick_add_shortcut = Shortcut::new(Some(modifiers), Code::Space);

    tauri::Builder::default()
        // Must be first so a second launch only focuses the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["quick"])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_quick_add(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            // Closing the main window keeps the app in the tray.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            build_main(&handle)?;
            build_tray(&handle)?;
            // The shortcut can be taken by another app; that must not stop the app.
            if let Err(error) = handle.global_shortcut().register(quick_add_shortcut) {
                eprintln!("needt-desktop: could not register quick-add shortcut: {error}");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Needt desktop")
        .run(|_app, _event| {
            // Dock icon click with no visible window brings the app back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_main(_app);
            }
        });
}
