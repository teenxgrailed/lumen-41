//! Needt desktop shell.
//!
//! The same Needt interface the browser gets, loaded from
//! https://use.needt.app, plus the native layers a browser tab cannot have:
//! a start window and browser-based sign-in (`auth`), a native menu
//! (`appmenu`), a menu-bar menu with today's tasks and a Dock badge (`tray`),
//! a global quick-add shortcut, native notifications, remembered window
//! geometry, a single running instance, and a bundled offline page instead
//! of a browser error (`net`).

mod appmenu;
mod auth;
mod net;
mod tray;

use serde_json::json;
use tauri::{
    menu::Menu, AppHandle, Listener, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_URL: &str = "https://use.needt.app";
const QUICK_ADD_PATH: &str = "quick-add";
const HOME_PATH: &str = "today";

/// Runs in every page of every window before the page's own scripts.
///
/// 1. `window.__needtDesktop` is the bridge the web app talks to
///    (src/lib/desktop.ts): the platform, and `dispatch`/`setHandler` for the
///    native menu and tray. Commands sent before the page has installed its
///    handler wait in a short queue.
/// 2. Links that would open a new window (`target=_blank`, `window.open`) are
///    turned into plain navigations, so the navigation guard decides whether
///    they stay in the app or go to the system browser.
/// 3. `window.Notification` is replaced by a shim over the Tauri notification
///    plugin: WKWebView has no Web Notifications, and this keeps the web
///    code unchanged. Resolved lazily because plugin globals may load later.
const INIT_JS: &str = r#"
(function () {
  if (window.__needtDesktop) return;
  var boot = window.__needtDesktopBoot || {};
  var queue = [];
  var handler = null;
  function deliver(command) {
    try { handler(command); } catch (_) {}
  }
  window.__needtDesktop = {
    platform: boot.platform,
    home: boot.home,
    dispatch: function (command) {
      if (handler) { deliver(command); return; }
      queue.push(command);
      if (queue.length > 20) queue.shift();
    },
    setHandler: function (next) {
      handler = typeof next === 'function' ? next : null;
      if (!handler) return;
      var waiting = queue;
      queue = [];
      waiting.forEach(deliver);
    }
  };

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

fn init_js() -> String {
    let platform = if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "other"
    };
    let boot = json!({ "platform": platform, "home": home_url().as_str() });
    format!("window.__needtDesktopBoot = {boot};\n{INIT_JS}")
}

pub(crate) fn start_url() -> Url {
    if cfg!(debug_assertions) {
        if let Ok(value) = std::env::var("NEEDT_DESKTOP_URL") {
            if let Ok(url) = Url::parse(&value) {
                return url;
            }
        }
    }
    Url::parse(DEFAULT_URL).expect("default url is valid")
}

fn home_url() -> Url {
    start_url().join(HOME_PATH).unwrap_or_else(|_| start_url())
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

/// The web app's own sign-in page. The app never shows it (sign-in happens in
/// the system browser); reaching it means the session ended.
fn is_sign_in_page(url: &Url, start: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some()
        && url.host_str() != Some("tauri.localhost")
        && (url.path() == "/auth/signin" || url.path().starts_with("/auth/signin/"))
        && (url.host_str() == start.host_str()
            || url.host_str().is_some_and(|h| h == "needt.app" || h.ends_with(".needt.app")))
}

/// Navigation guard: `needt://` words are the app's own, needt.app stays in
/// the app, everything else goes to the system browser.
fn nav_guard(app: &AppHandle) -> impl Fn(&Url) -> bool + Send + 'static {
    let app = app.clone();
    let start = start_url();
    move |url: &Url| {
        if url.scheme() == "needt" {
            auth::handle_nav_link(&app, url);
            return false;
        }
        if is_internal(url, &start) {
            if is_sign_in_page(url, &start) {
                auth::signed_out(&app);
                return false;
            }
            return true;
        }
        if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
            let _ = app.opener().open_url(url.as_str(), None::<&str>);
        }
        false
    }
}

/// The main window. On macOS its title bar is the web app's own top bar: the
/// bar is transparent and the traffic lights sit over its left end.
pub(crate) fn build_main(app: &AppHandle, url: WebviewUrl) -> tauri::Result<()> {
    if app.get_webview_window("main").is_some() {
        return Ok(());
    }
    let builder = WebviewWindowBuilder::new(app, "main", url)
        .title("Needt")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .initialization_script(init_js())
        .on_navigation(nav_guard(app));
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(LogicalPosition::new(18.0, 20.0));
    builder.build()?;
    Ok(())
}

/// The start window: small, centred, bundled (opens at once, works offline).
pub(crate) fn show_welcome(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("welcome") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let builder = WebviewWindowBuilder::new(app, "welcome", WebviewUrl::App("index.html".into()))
        .title("Needt")
        .inner_size(420.0, 560.0)
        .resizable(false)
        .maximizable(false)
        .center()
        .initialization_script(init_js())
        .on_navigation(nav_guard(app));
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true);
    let _ = builder.build();
}

/// Launch: the start window until this machine has signed in, then Today (or
/// the bundled offline page when there is no connection).
pub(crate) fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if !auth::is_signed_in(&app) {
            show_welcome(&app);
            return;
        }
        let online = tauri::async_runtime::spawn_blocking(net::is_online)
            .await
            .unwrap_or(true);
        let url = if online {
            WebviewUrl::External(home_url())
        } else {
            WebviewUrl::App("offline.html".into())
        };
        if build_main(&app, url).is_err() {
            show_welcome(&app);
        }
    });
}

/// "Open Needt": the main window, else the start window, else launch again.
pub(crate) fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }
    if let Some(window) = app.get_webview_window("welcome") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    start(app);
}

/// Hands a command to the web app (see `DesktopCommand` in src/lib/desktop.ts).
/// Does nothing without a main window: commands never create one.
pub(crate) fn send_command(app: &AppHandle, command: serde_json::Value) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.eval(format!(
        "window.__needtDesktop && window.__needtDesktop.dispatch({command});"
    ));
}

/// View, Reload. Offline it does nothing: the page already open keeps its own
/// offline state, and a reload would only trade it for an error.
pub(crate) fn reload_main(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let online = tauri::async_runtime::spawn_blocking(net::is_online)
            .await
            .unwrap_or(true);
        if !online {
            return;
        }
        if let Some(window) = app.get_webview_window("main") {
            // From a bundled page (the offline one) Reload goes home.
            let _ = window.eval(
                "(function(){var b=window.__needtDesktop&&window.__needtDesktop.home;\
                 var local=location.protocol==='tauri:'||location.hostname==='tauri.localhost';\
                 if(local&&b){location.replace(b);}else{location.reload();}})();",
            );
        }
    });
}

/// Small always-on-top window on the web app's own /quick-add page.
pub(crate) fn show_quick_add(app: &AppHandle) {
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
        .initialization_script(init_js())
        .on_navigation(nav_guard(app))
        .build();
}

pub fn run() {
    let modifiers = if cfg!(target_os = "macos") {
        Modifiers::SUPER | Modifiers::SHIFT
    } else {
        Modifiers::CONTROL | Modifiers::SHIFT
    };
    let quick_add_shortcut = Shortcut::new(Some(modifiers), Code::Space);

    tauri::Builder::default()
        // Must be first so a second launch only focuses the running app (and,
        // with the deep-link feature, hands it a needt:// link).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["quick", "welcome"])
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
        .manage(auth::AuthFlow::default())
        .menu(|app| appmenu::build(app).or_else(|_| Menu::default(app)))
        .on_menu_event(|app, event| {
            let id: &str = event.id.as_ref();
            if !id.starts_with("tray-") {
                appmenu::handle(app, id);
            }
        })
        .on_window_event(|window, event| {
            // Closing the main or start window keeps the app in the tray.
            if matches!(window.label(), "main" | "welcome") {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            tray::build(&handle)?;

            // The web app reports the menu-bar contents and that it is signed in.
            let for_tray = handle.clone();
            app.listen("needt-tray-state", move |event| {
                if let Ok(state) = serde_json::from_str::<tray::TrayState>(event.payload()) {
                    tray::update(&for_tray, state);
                }
            });
            let for_signed_in = handle.clone();
            app.listen("needt-signed-in", move |_| {
                auth::remember_signed_in(&for_signed_in);
            });

            // The browser hands a sign-in back as needt://auth?code=...
            #[cfg(windows)]
            {
                let _ = app.deep_link().register_all();
            }
            let for_links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    auth::handle_deep_link(&for_links, &url);
                }
            });

            start(&handle);

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
