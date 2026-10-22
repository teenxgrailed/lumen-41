import AppKit
import Foundation
import NeedtKit

/// Whether this person's plan includes the island (Pro, a Pro trial or
/// Lifetime). Read from the same `/api/billing` summary the web app's settings
/// use. Offline or on a server error the last known answer stays; signed out is
/// Free. There is no purchase path anywhere in the app.
@MainActor
final class IslandEntitlement: ObservableObject {
    static let shared = IslandEntitlement()

    @Published private(set) var isPro: Bool

    private static let key = "needtIslandIsPro"
    private var timer: Timer?
    private var observer: NSObjectProtocol?

    /// CI only: `--ci-fake-pro` lets the launch smoke test run the island
    /// without an account. It changes nothing on disk and nothing server-side.
    static let ciFakePro = CommandLine.arguments.contains("--ci-fake-pro")

    private init() {
        isPro = Self.ciFakePro || UserDefaults.standard.bool(forKey: Self.key)
    }

    func start() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        observer = NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func refresh() {
        guard !Self.ciFakePro else { return }
        Task {
            do {
                let plan = try await AppController.shared.tray.api.plan()
                set(plan == "PRO" || plan == "LIFETIME")
            } catch let error as NeedtAPIError {
                if case .notSignedIn = error { set(false) }
            } catch {
                // Offline or a server error: keep the last known answer.
            }
        }
    }

    /// Signed out.
    func reset() {
        guard !Self.ciFakePro else { return }
        set(false)
    }

    private func set(_ value: Bool) {
        guard !Self.ciFakePro else { return }
        UserDefaults.standard.set(value, forKey: Self.key)
        if value != isPro { isPro = value }
        IslandHost.apply()
    }
}
