import AppKit
import NeedtKit
import WebKit

/// The native half of the contract the web app already speaks to the Tauri
/// shell (src/lib/desktop.ts), so the web side works unchanged:
///
///  - `window.__needtDesktop` { platform, home, dispatch, setHandler }: native
///    menu and tray commands go to the page through it.
///  - `window.__TAURI__.event.emit(name, payload)`: the page reports the tray
///    state (`needt-tray-state`) and that it is signed in (`needt-signed-in`).
///    Only the names handled below do anything.
///  - `window.__TAURI__.notification`: `window.Notification` is replaced by a
///    shim over UNUserNotificationCenter (WKWebView has no Web Notifications).
///  - `data-tauri-drag-region` elements drag the window.
///
/// `__TAURI__` here is only a shim carrying those two namespaces; there is no
/// Tauri in this app. `window.__needtNative` marks the Swift app for any code
/// that must tell the two shells apart.
enum WebBridge {
    static let handlerName = "needt"

    private static let source = #"""
    (function () {
      if (window.__needtDesktop) return;
      var boot = __BOOT__;
      var host = location.hostname;
      if (!(host === 'needt.app' || host.slice(-9) === '.needt.app' || host === boot.devHost)) return;
      var post = function (message) {
        try { return window.webkit.messageHandlers.needt.postMessage(message); }
        catch (_) { return Promise.resolve(null); }
      };

      var queue = [];
      var handler = null;
      function deliver(command) { try { handler(command); } catch (_) {} }
      window.__needtNative = { platform: 'mac-swift' };
      window.__needtDesktop = {
        platform: 'mac',
        // Same flag the Tauri shell sets on macOS: the web app then marks
        // html[data-vibrancy="on"] and its sidebar turns translucent.
        vibrancy: true,
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

      var permission = 'default';
      var tauri = {
        event: {
          emit: function (name, payload) {
            return post({ kind: 'event', name: String(name), payload: payload === undefined ? null : payload });
          }
        },
        notification: {
          isPermissionGranted: function () {
            return post({ kind: 'notification.granted' }).then(function (ok) {
              if (ok) permission = 'granted';
              return !!ok;
            });
          },
          requestPermission: function () {
            return post({ kind: 'notification.request' }).then(function (r) {
              permission = r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'default';
              return permission;
            });
          },
          sendNotification: function (options) {
            options = options || {};
            post({ kind: 'notification.send', title: String(options.title || ''), body: String(options.body || '') });
          }
        }
      };
      window.__TAURI__ = tauri;

      function NeedtNotification(title, options) {
        options = options || {};
        this.title = String(title);
        this.body = options.body || '';
        this.close = function () {};
        tauri.notification.sendNotification({ title: this.title, body: this.body });
      }
      Object.defineProperty(NeedtNotification, 'permission', { get: function () { return permission; } });
      NeedtNotification.requestPermission = function (cb) {
        return tauri.notification.requestPermission().then(function (r) {
          if (typeof cb === 'function') cb(r);
          return r;
        });
      };
      try { window.Notification = NeedtNotification; } catch (_) {}
      tauri.notification.isPermissionGranted().catch(function () {});

      // Links that would open a new window become plain navigations, so the
      // native navigation guard decides: inside the app or the default browser.
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
        if (a && a.href) { e.preventDefault(); window.location.href = a.href; }
      }, true);
      window.open = function (u) {
        if (u) { try { window.location.href = new URL(String(u), window.location.href).href; } catch (_) {} }
        return null;
      };

      // The page's top bar is the window's drag handle. Only empty chrome is
      // marked, never a control; a double click zooms like a title bar.
      var INTERACTIVE = 'button,a,input,textarea,select,label,[role="button"],[role="tab"],[contenteditable="true"]';
      document.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || !e.target || !e.target.closest) return;
        if (!e.target.closest('[data-tauri-drag-region]') || e.target.closest(INTERACTIVE)) return;
        post({ kind: e.detail === 2 ? 'zoom' : 'drag' });
      }, true);

      // Vibrancy: the page asks for it with html[data-desktop="mac"][data-vibrancy="on"].
      var lastVibrancy = null;
      function reportVibrancy() {
        var el = document.documentElement;
        var on = el.getAttribute('data-vibrancy') === 'on' && el.getAttribute('data-desktop') === 'mac';
        if (on === lastVibrancy) return;
        lastVibrancy = on;
        post({ kind: 'vibrancy', on: on });
      }
      new MutationObserver(reportVibrancy).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-vibrancy', 'data-desktop']
      });
      document.addEventListener('DOMContentLoaded', reportVibrancy);
    })();
    """#

    static func userScript() -> WKUserScript {
        let boot: [String: Any] = [
            "home": Config.homeURL.absoluteString,
            "devHost": Config.base.host ?? "",
        ]
        let data = (try? JSONSerialization.data(withJSONObject: boot)) ?? Data("{}".utf8)
        let json = String(data: data, encoding: .utf8) ?? "{}"
        return WKUserScript(
            source: source.replacingOccurrences(of: "__BOOT__", with: json),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    /// Hands a command to the page (see `DesktopCommand` in src/lib/desktop.ts).
    @MainActor
    static func dispatch(_ command: [String: Any], to webView: WKWebView) {
        guard let data = try? JSONSerialization.data(withJSONObject: command),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.__needtDesktop && window.__needtDesktop.dispatch(\(json));", completionHandler: nil)
    }
}

/// What a page may ask the shell for. One instance per web view.
@MainActor
protocol BridgeHost: AnyObject {
    func bridgeDidRequestDrag(_ event: NSEvent?)
    func bridgeDidRequestZoom()
    func bridgeDidSetVibrancy(_ on: Bool)
}

extension BridgeHost {
    func bridgeDidRequestDrag(_ event: NSEvent?) {}
    func bridgeDidRequestZoom() {}
    func bridgeDidSetVibrancy(_ on: Bool) {}
}

final class BridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var host: BridgeHost?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor (Any?, String?) -> Void
    ) {
        // Only the app's own pages, in their main frame, may talk to the shell.
        guard message.frameInfo.isMainFrame,
              Config.isTrustedHost(message.frameInfo.securityOrigin.host, scheme: message.frameInfo.securityOrigin.protocol),
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String
        else {
            replyHandler(nil, nil)
            return
        }
        Task { @MainActor in
            await self.handle(kind: kind, body: body, reply: replyHandler)
        }
    }

    @MainActor
    private func handle(kind: String, body: [String: Any], reply: @MainActor (Any?, String?) -> Void) async {
        switch kind {
        case "event":
            handleEvent(name: body["name"] as? String ?? "", payload: body["payload"])
            reply(nil, nil)
        case "notification.granted":
            reply(await Notifier.shared.isGranted(), nil)
        case "notification.request":
            reply(await Notifier.shared.request() ? "granted" : "denied", nil)
        case "notification.send":
            Notifier.shared.send(title: body["title"] as? String ?? "", body: body["body"] as? String ?? "")
            reply(nil, nil)
        case "vibrancy":
            host?.bridgeDidSetVibrancy(body["on"] as? Bool ?? false)
            reply(nil, nil)
        case "drag":
            host?.bridgeDidRequestDrag(NSApp.currentEvent)
            reply(nil, nil)
        case "zoom":
            host?.bridgeDidRequestZoom()
            reply(nil, nil)
        default:
            reply(nil, nil)
        }
    }

    @MainActor
    private func handleEvent(name: String, payload: Any?) {
        switch name {
        case "needt-tray-state":
            if let payload, let state = TrayState.parse(json: payload) {
                AppController.shared.tray.apply(state)
            }
        case "needt-signed-in":
            AppController.shared.auth.signedIn()
        case "needt-theme":
            // "light", "dark" or "system": the window follows the app's theme so
            // the material behind the sidebar matches (as the Tauri shell does).
            AppController.shared.setWindowTheme(payload as? String ?? "system")
        default:
            break
        }
    }
}
