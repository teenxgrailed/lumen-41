import Foundation

/// Where the app points and what stays inside it.
enum Config {
    static let productionBase = URL(string: "https://use.needt.app")!
    static let site = URL(string: "https://needt.app")!

    static let homePath = "today"
    /// The web app's desktop quick-add card (the Tauri shell loads the same one).
    static let quickAddPath = "desktop-quick-add"

    /// The web app. Debug builds can aim at a local server:
    /// `NEEDT_URL=http://localhost:3000`.
    static var base: URL {
        #if DEBUG
        if let value = ProcessInfo.processInfo.environment["NEEDT_URL"], let url = URL(string: value) {
            return url
        }
        #endif
        return productionBase
    }

    static var homeURL: URL { base.appendingPathComponent(homePath) }
    static var quickAddURL: URL { base.appendingPathComponent(quickAddPath) }

    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    /// True for pages that belong in the app: needt.app and its subdomains over
    /// https, about:blank, and (debug only) the dev server.
    static func isInternal(_ url: URL) -> Bool {
        switch url.scheme?.lowercased() {
        case "about", "blob", "data":
            return true
        case "https":
            guard let host = url.host?.lowercased() else { return false }
            return host == "needt.app" || host.hasSuffix(".needt.app") || isDevHost(url)
        case "http":
            return isDevHost(url)
        default:
            return false
        }
    }

    /// The host of the origin a script message came from.
    static func isTrustedHost(_ host: String, scheme: String) -> Bool {
        let h = host.lowercased()
        if scheme == "https" && (h == "needt.app" || h.hasSuffix(".needt.app")) { return true }
        #if DEBUG
        return h == base.host?.lowercased() && scheme == base.scheme
        #else
        return false
        #endif
    }

    private static func isDevHost(_ url: URL) -> Bool {
        #if DEBUG
        return url.host == base.host && url.scheme == base.scheme
        #else
        return false
        #endif
    }

    /// The web app's own sign-in page. The app never shows it (sign-in happens
    /// in the system browser); reaching it means the session ended.
    static func isSignInPage(_ url: URL) -> Bool {
        guard isInternal(url), url.scheme == "https" || url.scheme == "http" else { return false }
        return url.path == "/auth/signin" || url.path.hasPrefix("/auth/signin/")
    }
}
