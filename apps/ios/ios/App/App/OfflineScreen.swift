import Network
import NeedtKit
import SwiftUI
import UIKit
import WebKit

// A native "You're offline" screen for when the main page cannot load (no
// network, the server is down). Without it the web view shows a blank page.
// It lists the last Today snapshot the widgets saved (read-only), retries on
// the Try again button, and retries on its own when the network path comes
// back. Installed by NeedtViewController; nothing else knows about it.

/// What the screen shows.
@MainActor
final class OfflineModel: ObservableObject {
    @Published var rows: [TodayRow] = []
    @Published var syncedNote: String?
    @Published var retrying = false
    var retry: () -> Void = {}

    /// Reads the cached snapshot. Only while a session exists in the vault, so
    /// a signed-out device never shows the previous person's list.
    func refresh(now: Date = Date()) {
        let repository = WidgetRepository()
        guard repository.isSignedIn, let hit = repository.cached() else {
            rows = []
            syncedNote = nil
            return
        }
        let today = TodayModel.make(snapshot: hit.value, status: .stale(hit.savedAt), now: now)
        rows = Array(today.rows.prefix(6))
        syncedNote = Self.stamp(hit.savedAt, now: now)
    }

    static func stamp(_ date: Date, now: Date) -> String {
        if Calendar.current.isDate(date, inSameDayAs: now) {
            return "Last synced " + WidgetClock.hhmm(date)
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return "Last synced " + formatter.string(from: date)
    }
}

struct OfflineScreen: View {
    @ObservedObject var model: OfflineModel

    var body: some View {
        ZStack {
            Color("LaunchGround").ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                Image("LaunchMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 72, height: 72)
                    .accessibilityHidden(true)
                Text("You're offline")
                    .font(.system(size: 20, weight: .semibold))
                    .padding(.top, 20)
                Text(model.rows.isEmpty
                     ? "Needt can't reach the server. It reloads on its own when you are back online."
                     : "Needt can't reach the server. Here is your last Today list.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
                if !model.rows.isEmpty {
                    list
                }
                Button {
                    model.retry()
                } label: {
                    Text(model.retrying ? "Trying…" : "Try again")
                        .font(.system(size: 13, weight: .medium))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 5)
                }
                .buttonStyle(.bordered)
                .tint(Color.primary)
                .disabled(model.retrying)
                .padding(.top, 24)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: 420)
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(model.rows) { row in
                HStack(spacing: 8) {
                    Image(systemName: row.done ? "checkmark.circle" : "circle")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.secondary)
                    Text(row.title)
                        .font(.system(size: 13))
                        .strikethrough(row.done)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if let time = row.time {
                        Text(time)
                            .font(.system(size: 12).monospacedDigit())
                            .foregroundStyle(Color.secondary)
                    }
                }
                .foregroundStyle(row.done ? Color.secondary : Color.primary)
            }
            if let note = model.syncedNote {
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.secondary)
                    .padding(.top, 4)
            }
        }
        .padding(.top, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Sits in front of Capacitor's navigation delegate: every call is passed on
/// untouched, and the two failure callbacks and `didFinish` are also reported.
/// WebKit keeps its delegate weakly and asks `respondsToSelector` once, so the
/// proxy answers for the wrapped delegate and forwards what it does not
/// implement itself.
final class NavigationFailureProxy: NSObject {
    private let target: NSObject & WKNavigationDelegate
    private let onFailure: @MainActor (Error) -> Void
    private let onFinish: @MainActor () -> Void

    init(target: NSObject & WKNavigationDelegate,
         onFailure: @escaping @MainActor (Error) -> Void,
         onFinish: @escaping @MainActor () -> Void) {
        self.target = target
        self.onFailure = onFailure
        self.onFinish = onFinish
        super.init()
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || target.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        target.responds(to: aSelector) ? target : super.forwardingTarget(for: aSelector)
    }
}

extension NavigationFailureProxy: WKNavigationDelegate {
    @MainActor
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        target.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        onFailure(error)
    }

    @MainActor
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        target.webView?(webView, didFail: navigation, withError: error)
        onFailure(error)
    }

    @MainActor
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        target.webView?(webView, didFinish: navigation)
        onFinish()
    }
}

/// Owns the overlay, the retry and the path monitor for one web view.
@MainActor
final class OfflineCoordinator {
    private weak var host: UIViewController?
    private weak var webView: WKWebView?
    private let model = OfflineModel()
    private var proxy: NavigationFailureProxy?
    private var hosting: UIHostingController<OfflineScreen>?
    private var monitor: NWPathMonitor?
    private var failedURL: URL?
    private var lastFailure = Date.distantPast

    init(host: UIViewController, webView: WKWebView) {
        self.host = host
        self.webView = webView
        model.retry = { [weak self] in self?.retry() }
    }

    /// Wraps the web view's current navigation delegate (Capacitor's).
    func install() {
        guard let webView, let target = webView.navigationDelegate as? (NSObject & WKNavigationDelegate) else { return }
        let proxy = NavigationFailureProxy(
            target: target,
            onFailure: { [weak self] error in self?.navigationFailed(error) },
            onFinish: { [weak self] in self?.navigationFinished() }
        )
        self.proxy = proxy
        webView.navigationDelegate = proxy
    }

    /// Only "the network or the server is not reachable" shows the screen.
    /// A cancelled load, a redirect, a download hand-off or a TLS failure
    /// (a server misconfiguration, not a lost connection) must not.
    static func isConnectivity(_ error: NSError) -> Bool {
        guard error.domain == NSURLErrorDomain else { return false }
        let codes = [
            NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
            NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed,
            NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff,
        ]
        return codes.contains(error.code)
    }

    private func navigationFailed(_ error: Error) {
        let nsError = error as NSError
        // Any failure ends a retry in progress, also one that is not about
        // connectivity (a cancelled load, a bad response): otherwise the button
        // stays on "Trying…" and the network monitor never retries again.
        model.retrying = false
        guard Self.isConnectivity(nsError) else { return }
        if let url = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL { failedURL = url }
        lastFailure = Date()
        show()
    }

    private func navigationFinished() {
        hide()
    }

    private func show() {
        model.refresh()
        guard hosting == nil, let host, let webView else { return }
        let controller = UIHostingController(rootView: OfflineScreen(model: model))
        controller.view.frame = webView.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addChild(controller)
        webView.addSubview(controller.view)
        controller.didMove(toParent: host)
        hosting = controller
        startMonitoring()
    }

    private func hide() {
        monitor?.cancel()
        monitor = nil
        model.retrying = false
        guard let controller = hosting else { return }
        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
        hosting = nil
    }

    /// The page to load again. A sign-in callback (`?code=`, `?state=`, the auth
    /// routes) is one-time: loading it a second time fails or signs nobody in,
    /// so those retry the app instead.
    static func retryURL(failed: URL?, base: URL) -> URL {
        let home = base.appendingPathComponent("today")
        guard let failed else { return home }
        let oneTime: Set<String> = ["code", "state", "token", "error", "id_token"]
        let items = URLComponents(url: failed, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let path = failed.path.lowercased()
        if items.contains(where: { oneTime.contains($0.name.lowercased()) })
            || path.hasPrefix("/api/auth") || path.hasPrefix("/auth") {
            return home
        }
        return failed
    }

    private func retry() {
        guard let webView else { return }
        model.retrying = true
        let url = Self.retryURL(failed: failedURL, base: WidgetEnvironment.baseURL)
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20))
    }

    private func startMonitoring() {
        monitor?.cancel()
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.networkCameBack() }
        }
        monitor.start(queue: DispatchQueue(label: "app.needt.ios.offline-path"))
        self.monitor = monitor
    }

    /// The first path report arrives right after the monitor starts; a report
    /// within 3 s of a failure does not retry at once (a server that is down
    /// must not loop), but it is checked again when the 3 s are over, because
    /// the path may not report a second time.
    private func networkCameBack() {
        guard hosting != nil, !model.retrying else { return }
        let wait = 3 - Date().timeIntervalSince(lastFailure)
        if wait > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + wait + 0.1) { [weak self] in
                guard let self, let monitor = self.monitor, monitor.currentPath.status == .satisfied else { return }
                self.networkCameBack()
            }
            return
        }
        retry()
    }
}
