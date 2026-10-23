import AppKit
import CryptoKit
import Foundation

/// What the start window shows (the dk-chrome spec's four states).
enum StartStep: Equatable {
    case start
    case browser
    case back
    case error
}

/// Sign-in without a web sign-in page in the app. It is the same PKCE flow
/// the Tauri shell speaks; the server half is untouched
/// (src/lib/auth/desktop-handoff.ts, /api/auth/desktop/code and /exchange).
///
/// 1. `begin()` makes a random 32-byte verifier, keeps it in memory (single
///    use, ten minutes) and opens the system browser on
///    `/auth/desktop?challenge=base64url(sha256(verifier))`, so Google and any
///    provider that refuses embedded web views works.
/// 2. The person signs in and confirms there; the page hands a one-time code
///    back as `needt://auth?code=...`.
/// 3. `handleDeepLink` loads `/auth/desktop-complete#code=...&verifier=...` in
///    the main window's web view. The fragment never reaches a server, a log
///    or a Referer. That page posts both to `/api/auth/desktop/exchange`,
///    which sets the NextAuth session cookie in the web view's own
///    `WKWebsiteDataStore`, then goes to /today.
/// 4. The page reports `needt-signed-in`; the start window closes.
///
/// A code stolen off the deep link by another program is useless without the
/// verifier, which never leaves this process except in that fragment.
@MainActor
final class AuthFlow: ObservableObject {
    @Published private(set) var step: StartStep = .start

    private static let ttl: TimeInterval = 10 * 60
    private static let completeTimeout: TimeInterval = 25
    private var pending: (verifier: String, started: Date)?
    private var timeout: Task<Void, Never>?

    // MARK: marker

    /// A file in Application Support: this machine has signed in before, so
    /// the next launch opens Today instead of the start window.
    private var markerURL: URL? {
        guard let dir = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return nil }
        return dir.appendingPathComponent("app.needt.mac", isDirectory: true).appendingPathComponent("signed-in")
    }

    var isSignedInBefore: Bool {
        guard let url = markerURL else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    private func writeMarker() {
        guard let url = markerURL else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? Data("1".utf8).write(to: url)
    }

    private func removeMarker() {
        if let url = markerURL { try? FileManager.default.removeItem(at: url) }
    }

    // MARK: sign-in

    private static func randomVerifier() -> String? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        return base64url(Data(bytes))
    }

    private static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Opens the system browser on the sign-in page.
    func begin() {
        guard let verifier = Self.randomVerifier() else {
            step = .error
            return
        }
        let challenge = Self.base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
        var components = URLComponents(url: Config.base.appendingPathComponent("auth/desktop"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "challenge", value: challenge)]
        guard let url = components?.url else {
            step = .error
            return
        }
        pending = (verifier, Date())
        step = .browser
        NSWorkspace.shared.open(url)
    }

    /// "Cancel" on the start window: forget the pending verifier.
    func cancel() {
        pending = nil
        timeout?.cancel()
        step = .start
    }

    private static func validCode(_ code: String) -> Bool {
        code.utf8.count == 43 && code.utf8.allSatisfy { b in
            (b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || b == 45 || b == 95
        }
    }

    /// `needt://auth?code=...` from the operating system. Used only while a
    /// sign-in this app started is pending.
    func handleDeepLink(_ url: URL) {
        guard url.scheme == "needt", url.host == "auth" else { return }
        guard let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "code" })?.value,
            Self.validCode(code)
        else { return }
        guard let pending, Date().timeIntervalSince(pending.started) < Self.ttl else {
            // A link with no sign-in of ours behind it, or an old one.
            self.pending = nil
            if AppController.shared.hasStartWindow { step = .error }
            return
        }
        self.pending = nil
        complete(code: code, verifier: pending.verifier)
    }

    /// Loads the page that trades code and verifier for a session.
    private func complete(code: String, verifier: String) {
        var components = URLComponents(url: Config.base.appendingPathComponent("auth/desktop-complete"), resolvingAgainstBaseURL: false)
        components?.fragment = "code=\(code)&verifier=\(verifier)"
        guard let url = components?.url else {
            step = .error
            return
        }
        step = .back
        AppController.shared.loadSignInCompletion(url)
        timeout?.cancel()
        timeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.completeTimeout * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.completionTimedOut()
        }
    }

    private func completionTimedOut() {
        guard step == .back else { return }
        step = .error
        AppController.shared.discardUnfinishedMain()
    }

    /// `needt://start-sign-in` / `needt://cancel-sign-in`, from the web app's
    /// own "Start again" button. Only these two words do anything.
    func handleNavigationLink(_ url: URL) {
        switch url.host {
        case "start-sign-in":
            AppController.shared.showStart()
            begin()
        case "cancel-sign-in":
            cancel()
        default:
            break
        }
    }

    /// Reported by the web app once a signed-in page has loaded.
    func signedIn() {
        timeout?.cancel()
        writeMarker()
        step = .start
        SessionSync.push(force: true)
        AppController.shared.signInFinished()
        IslandEntitlement.shared.refresh()
    }

    /// The web app wants its sign-in page: the session ended or the person
    /// signed out. The app never shows that page; it forgets this machine's
    /// marker and goes back to its own start window.
    func signedOut() {
        removeMarker()
        SessionSync.clear()
        pending = nil
        timeout?.cancel()
        step = .start
        AppController.shared.tray.reset()
        IslandEntitlement.shared.reset()
        AppController.shared.showStartAfterSignOut()
    }
}
