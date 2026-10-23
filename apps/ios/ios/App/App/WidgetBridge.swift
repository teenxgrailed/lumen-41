import AppIntents
import Capacitor
import NeedtKit
import UIKit
import WebKit
import WidgetKit

/// What the app does for the widgets, the Controls and the focus Live Activity:
///  - copies the signed-in session (the needt.app cookies of the web view) into
///    the shared vault so the extension can call the API,
///  - opens `needt://open?path=...` links and the Quick add Control's pending
///    link in the web view,
///  - keeps the Live Activity in step with the server's focus session while the
///    app is in front.
final class WidgetBridge: NSObject, WKHTTPCookieStoreObserver {
    static let shared = WidgetBridge()

    private var timer: Timer?
    private var lastSignedIn: Bool?

    private var store: WKHTTPCookieStore { WKWebsiteDataStore.default().httpCookieStore }

    func start() {
        store.add(self)
        syncSession()
    }

    // MARK: session

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { syncSession() }

    func syncSession() {
        store.getAllCookies { cookies in
            let signedIn = CookieVault.shared.store(cookies)
            if !signedIn {
                // Signed out in the web app: the widgets must not keep showing data.
                CookieVault.shared.clear()
            }
            if self.lastSignedIn != signedIn {
                self.lastSignedIn = signedIn
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }

    // MARK: links

    /// Opens a `needt://open?path=` link (or a pending one) in the web view.
    @discardableResult
    func open(_ url: URL, in webView: WKWebView?) -> Bool {
        guard let path = NeedtLink.path(from: url), let webView,
              let target = URL(string: path, relativeTo: WidgetEnvironment.baseURL)?.absoluteURL,
              target.host == WidgetEnvironment.baseURL.host
        else { return false }
        webView.load(URLRequest(url: target))
        return true
    }

    func openPending(in webView: WKWebView?) {
        if let link = PendingLink.take() { open(link, in: webView) }
    }

    // MARK: Live Activity

    func sceneDidBecomeActive(webView: WKWebView?) {
        syncSession()
        openPending(in: webView)
        reconcileFocus()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.reconcileFocus() }
    }

    func sceneWillResignActive() {
        reconcileFocus()
        timer?.invalidate()
        timer = nil
    }

    func reconcileFocus() {
        guard #available(iOS 16.2, *) else { return }
        Task {
            let load = await WidgetRepository().load()
            await FocusActivityController.shared.reconcile(snapshot: load.snapshot)
            WidgetCenter.shared.reloadTimelines(ofKind: FocusWidgetKind.value)
        }
    }
}

/// The kind string of the Focus timer widget (NeedtWidgetKit.FocusTimerWidget).
enum FocusWidgetKind { static let value = "app.needt.widget.focus" }

/// Lets the metadata extractor find the LiveActivityIntent that lives in NeedtKit.
@available(iOS 17.0, *)
struct NeedtAppIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [NeedtKitIntentsPackage.self] }
}
