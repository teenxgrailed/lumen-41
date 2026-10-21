import AppKit
import Network
import SwiftUI
import WebKit

/// A web view of the Needt interface: the persistent default data store (the
/// session cookie lives there), the bridge script, a navigation guard that
/// keeps the app on needt.app, and the offline screen over it when the page
/// cannot be reached.
@MainActor
final class NeedtWebView: NSObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    /// Hosts the offline screen; add it above `webView` in the same container.
    let offlineHost: NSHostingView<OfflineView>

    private let handler: BridgeHandler
    private var monitor: NWPathMonitor?
    private var retryTimer: Timer?
    private var target: URL?
    private(set) var isOffline = false {
        didSet { offlineHost.isHidden = !isOffline }
    }

    /// Called when the page asked for its own sign-in page (the session ended).
    var onSignedOut: (() -> Void)?

    /// Who the page's drag and zoom requests go to (held weakly).
    weak var bridgeHost: BridgeHost? {
        didSet { handler.host = bridgeHost }
    }

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.isElementFullscreenEnabled = true
        let controller = WKUserContentController()
        let handler = BridgeHandler()
        controller.addUserScript(WebBridge.userScript())
        controller.addScriptMessageHandler(handler, contentWorld: .page, name: WebBridge.handlerName)
        configuration.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        webView.isInspectable = true
        #endif

        self.webView = webView
        self.handler = handler
        self.offlineHost = NSHostingView(rootView: OfflineView(retry: {}))
        super.init()
        offlineHost.rootView = OfflineView(retry: { [weak self] in self?.retryNow() })
        offlineHost.isHidden = true
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    deinit {
        monitor?.cancel()
        retryTimer?.invalidate()
    }

    func load(_ url: URL) {
        target = url
        webView.load(URLRequest(url: url))
    }

    /// Reload; from the offline screen (nothing loaded) this goes to the target.
    func reload() {
        if isOffline || webView.url == nil, let target {
            webView.load(URLRequest(url: target))
        } else {
            webView.reload()
        }
    }

    // MARK: offline

    private func showOffline() {
        guard !isOffline else { return }
        isOffline = true
        retryTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.retryNow() }
        }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.retryNow() }
        }
        monitor.start(queue: DispatchQueue(label: "app.needt.mac.path"))
        self.monitor = monitor
    }

    private func hideOffline() {
        guard isOffline else { return }
        isOffline = false
        retryTimer?.invalidate()
        retryTimer = nil
        monitor?.cancel()
        monitor = nil
    }

    private func retryNow() {
        guard isOffline, let target else { return }
        webView.load(URLRequest(url: target))
    }

    // MARK: WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "needt" {
            AppController.shared.auth.handleNavigationLink(url)
            decisionHandler(.cancel)
            return
        }
        if Config.isInternal(url) {
            if navigationAction.targetFrame?.isMainFrame != false, Config.isSignInPage(url) {
                onSignedOut?()
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }
        if ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideOffline()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    private func handleFailure(_ error: Error) {
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else { return }
        switch nsError.code {
        case NSURLErrorCancelled:
            return
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
             NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed,
             NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed:
            showOffline()
        default:
            break
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: WKUIDelegate

    /// `target=_blank` and `window.open` that the page script did not already
    /// rewrite: same rules, internal in this view, the rest in the browser.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if Config.isInternal(url), !Config.isSignInPage(url) {
                webView.load(URLRequest(url: url))
            } else if ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") {
                NSWorkspace.shared.open(url)
            }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    /// File inputs (attachments, imports).
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.begin { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }
}
