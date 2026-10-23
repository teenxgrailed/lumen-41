//! Sign-in without a web sign-in page in the app.
//!
//! The start window asks to sign in; the system browser opens
//! `/auth/desktop?challenge=...` (so Google and any other provider that
//! refuses embedded webviews works); the person signs in and confirms there;
//! the page hands a one-time code back as `needt://auth?code=...`; the app
//! loads `/auth/desktop-complete#code=...&verifier=...` in its own window,
//! which trades the pair for the session cookie.
//!
//! It is PKCE. The verifier is 32 random bytes that never leave this process
//! except in that fragment (a fragment is never sent to a server, a log or a
//! Referer); only its SHA-256 goes to the browser. A code stolen off the
//! deep link by another program is useless without it. The verifier is single
//! use and lives ten minutes. Server half: src/lib/auth/desktop-handoff.ts.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Url, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

const FLOW_TTL: Duration = Duration::from_secs(10 * 60);
/// How long the start window waits for the signed-in page before showing it anyway.
const HANDOVER_TIMEOUT: Duration = Duration::from_secs(20);
/// A file in the app's data folder: this machine has signed in before, so the
/// next launch opens Today instead of the start window.
const MARKER: &str = "signed-in";

/// The pending sign-in: the verifier and when it was made.
#[derive(Default)]
pub struct AuthFlow(Mutex<Option<(String, Instant)>>);

fn random_verifier() -> Option<String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).ok()?;
    Some(URL_SAFE_NO_PAD.encode(bytes))
}

/// Opens the system browser on the sign-in page.
pub fn begin(app: &AppHandle) {
    let Some(verifier) = random_verifier() else {
        eprintln!("needt-desktop: no randomness, sign-in not started");
        return;
    };
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let Ok(mut url) = crate::start_url().join("auth/desktop") else {
        return;
    };
    url.query_pairs_mut().append_pair("challenge", &challenge);
    if let Ok(mut flow) = app.state::<AuthFlow>().0.lock() {
        *flow = Some((verifier, Instant::now()));
    }
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
}

/// "Cancel" on the start window: forget the pending verifier.
pub fn cancel(app: &AppHandle) {
    if let Ok(mut flow) = app.state::<AuthFlow>().0.lock() {
        *flow = None;
    }
}

/// `needt://start-sign-in` and `needt://cancel-sign-in`, navigated to by the
/// start page or the web app's own "Start again" button. The navigation is
/// cancelled by the caller; only these two words do anything.
pub fn handle_nav_link(app: &AppHandle, url: &Url) {
    match url.host_str() {
        Some("start-sign-in") => begin(app),
        Some("cancel-sign-in") => cancel(app),
        _ => {}
    }
}

fn valid_code(code: &str) -> bool {
    code.len() == 43
        && code
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// `needt://auth?code=...`, from the operating system. Used only while a
/// sign-in this app started is pending.
pub fn handle_deep_link(app: &AppHandle, url: &Url) {
    if url.scheme() != "needt" || url.host_str() != Some("auth") {
        return;
    }
    let Some((_, code)) = url.query_pairs().find(|(key, _)| key == "code") else {
        return;
    };
    if !valid_code(&code) {
        return;
    }
    let verifier = match app.state::<AuthFlow>().0.lock() {
        Ok(mut flow) => match flow.take() {
            Some((verifier, started)) if started.elapsed() < FLOW_TTL => verifier,
            // A sign-in this app started, but it waited too long: say so.
            Some(_) => {
                welcome_state(app, "error");
                return;
            }
            // Nothing pending: a link some other program made. Ignored.
            None => return,
        },
        Err(_) => return,
    };
    // The start window says "Signing you in…" while the session is made.
    welcome_state(app, "back");
    complete(app, &code, &verifier);
}

/// Loads the page that trades code and verifier for a session, in the main
/// window (made now if there is none), then drops the start window.
fn complete(app: &AppHandle, code: &str, verifier: &str) {
    let Ok(mut url) = crate::start_url().join("auth/desktop-complete") else {
        return;
    };
    let fragment = format!("code={code}&verifier={verifier}");
    url.set_fragment(Some(fragment.as_str()));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match app.get_webview_window("main") {
            Some(main) => {
                let target = serde_json::to_string(url.as_str()).unwrap_or_default();
                let _ = main.eval(format!("window.location.replace({target})"));
                let _ = main.show();
                let _ = main.set_focus();
            }
            None => {
                // The new window first: closing the last one would end the app.
                // While the start window is up the new one stays hidden: the
                // start window keeps saying "Signing you in…" and hands over
                // when the signed-in page reports (`finish_welcome`), or shows
                // the expired-link state when the exchange fails
                // (`welcome_failed`).
                let hidden = app.get_webview_window("welcome").is_some();
                if crate::build_main(&app, WebviewUrl::External(url), !hidden).is_err() {
                    welcome_state(&app, "error");
                    return;
                }
                if hidden {
                    // Never leave the person staring at a spinner.
                    let app = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(HANDOVER_TIMEOUT);
                        finish_welcome(&app);
                    });
                }
                return;
            }
        }
        if let Some(welcome) = app.get_webview_window("welcome") {
            let _ = welcome.destroy();
        }
    });
}

/// Tells the start window how the sign-in is going ("browser", "back",
/// "error" or "idle"; see dist/index.html).
pub fn welcome_state(app: &AppHandle, state: &str) {
    if let Some(welcome) = app.get_webview_window("welcome") {
        let _ = welcome.eval(format!(
            "window.__needtWelcome && window.__needtWelcome('{state}');"
        ));
    }
}

/// The signed-in page is up in the (hidden) main window: show it, drop the
/// start window.
pub fn finish_welcome(app: &AppHandle) {
    let Some(welcome) = app.get_webview_window("welcome") else {
        return;
    };
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
        let _ = welcome.destroy();
    }
}

/// The exchange failed in the hidden main window: back to the start window,
/// with the expired-link state, and no leftover window.
pub fn welcome_failed(app: &AppHandle) {
    if app.get_webview_window("welcome").is_none() {
        return;
    }
    welcome_state(app, "error");
    if let Some(main) = app.get_webview_window("main") {
        if !main.is_visible().unwrap_or(true) {
            let _ = main.destroy();
        }
    }
}

fn marker_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(MARKER))
}

pub fn is_signed_in(app: &AppHandle) -> bool {
    marker_path(app).is_some_and(|path| path.exists())
}

/// Sent by the web app once a signed-in page has loaded.
pub fn remember_signed_in(app: &AppHandle) {
    if let Some(path) = marker_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(path, "1");
    }
}

/// The web app wants the sign-in page: the session ended or the person signed
/// out. The app never shows that page; it forgets this machine's marker and
/// goes back to its own start window.
pub fn signed_out(app: &AppHandle) {
    if let Some(path) = marker_path(app) {
        let _ = fs::remove_file(path);
    }
    crate::tray::update(app, crate::tray::TrayState::default());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // The start window first: closing the last window would end the app.
        crate::show_welcome(&app);
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.destroy();
        }
    });
}
