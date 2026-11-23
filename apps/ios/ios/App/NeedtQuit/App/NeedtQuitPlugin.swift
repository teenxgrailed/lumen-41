#if HABITS_QUIT
import Capacitor
import FamilyControls
import NeedtKit
import SwiftUI
import UIKit
import WebKit

/// `window.Capacitor.Plugins.NeedtQuit`: the web app's handle on the quit
/// blocker. Registered by `NeedtViewController` only in a build with
/// `HABITS_QUIT`. The web app calls it only when the server flag `habits_quit`
/// is on for the account, and passes that through `setEnabled`; the screens
/// that call the rest come from the design handoff.
///
///  - `status()` -> `{ enabled, authorization, habits }`
///  - `setEnabled({ enabled })`: false takes every shield down
///  - `requestAuthorization()`: individual Screen Time authorization
///  - `selectApps({ habitId, startHour?, startMinute?, endHour?, endMinute? })`:
///    shows the system picker, saves the choice, puts the shield up
///  - `refresh({ habitId })`: fetches `/api/habits/<id>/quit-summary` for the shield
///  - `remove({ habitId })`: takes the habit's shield down and forgets it
@objc(NeedtQuitPlugin)
public class NeedtQuitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeedtQuitPlugin"
    public let jsName = "NeedtQuit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    @objc func status(_ call: CAPPluginCall) {
        call.resolve([
            "enabled": QuitFlag.isEnabled(),
            "authorization": QuitBlocker.authorization.rawValue,
            "habits": QuitBlocker.habitIds,
        ])
    }

    @objc func setEnabled(_ call: CAPPluginCall) {
        let on = call.getBool("enabled") ?? false
        QuitFlag.setEnabled(on)
        if !on { QuitBlocker.removeAll() }
        call.resolve(["enabled": on])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        Task {
            do {
                try await QuitBlocker.requestAuthorization()
                call.resolve(["authorization": QuitBlocker.authorization.rawValue])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func selectApps(_ call: CAPPluginCall) {
        guard QuitFlag.isEnabled() else { return call.reject("Quit blocker is off") }
        guard let habitId = call.getString("habitId"), QuitDeepLink.isValid(habitId: habitId) else {
            return call.reject("habitId is missing or invalid")
        }
        var schedule: QuitSchedule?
        if let sh = call.getInt("startHour"), let eh = call.getInt("endHour") {
            schedule = QuitSchedule(startHour: sh, startMinute: call.getInt("startMinute") ?? 0,
                                    endHour: eh, endMinute: call.getInt("endMinute") ?? 0)
            if schedule == nil { return call.reject("The schedule is not valid") }
        }
        DispatchQueue.main.async {
            guard QuitBlocker.authorization == .approved else { return call.reject("Screen Time is not authorized") }
            guard let presenter = self.bridge?.viewController else { return call.reject("No view to present from") }
            let existing = QuitSelectionRegistry().entry(habitId: habitId)?.selection ?? FamilyActivitySelection()
            let host = UIHostingController(rootView: QuitPickerView(initial: existing) { chosen in
                presenter.presentedViewController?.dismiss(animated: true)
                guard let chosen else { return call.reject("cancelled", "cancelled") }
                do {
                    try QuitBlocker.shield(habitId: habitId, selection: chosen, schedule: schedule)
                    call.resolve([
                        "applications": chosen.applicationTokens.count,
                        "webDomains": chosen.webDomainTokens.count,
                        "categories": chosen.categoryTokens.count,
                    ])
                } catch {
                    call.reject(error.localizedDescription)
                }
            })
            presenter.present(host, animated: true)
        }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        guard QuitFlag.isEnabled() else { return call.reject("Quit blocker is off") }
        guard let habitId = call.getString("habitId"), QuitDeepLink.isValid(habitId: habitId) else {
            return call.reject("habitId is missing or invalid")
        }
        let vault = CookieVault.shared
        let api = NeedtAPI(baseURL: WidgetEnvironment.baseURL) { vault.load() }
        Task {
            do {
                let record = try await QuitSync.refresh(habitId: habitId, api: api)
                call.resolve(["currentStreakDays": record.summary.currentStreakDays,
                              "currentStreakHours": record.summary.currentStreakHours])
            } catch {
                call.reject((error as? NeedtAPIError)?.message ?? error.localizedDescription)
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let habitId = call.getString("habitId"), QuitDeepLink.isValid(habitId: habitId) else {
            return call.reject("habitId is missing or invalid")
        }
        QuitBlocker.remove(habitId: habitId)
        call.resolve()
    }
}

/// The system picker in a bare sheet: Cancel and Done, nothing else.
struct QuitPickerView: View {
    @State private var selection: FamilyActivitySelection
    let finish: (FamilyActivitySelection?) -> Void

    init(initial: FamilyActivitySelection, finish: @escaping (FamilyActivitySelection?) -> Void) {
        _selection = State(initialValue: initial)
        self.finish = finish
    }

    var body: some View {
        NavigationStack {
            FamilyActivityPicker(selection: $selection)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { finish(nil) } }
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { finish(selection) } }
                }
        }
    }
}

/// Opens the panic route for a habit. Called by `WidgetBridge` for
/// `needt://habits/<id>/panic` (a tapped shield notification) and for the id a
/// shield extension left behind when the app comes to the front.
extension WidgetBridge {
    @discardableResult
    func openQuitPanic(_ url: URL, in webView: WKWebView?) -> Bool {
        guard let id = QuitDeepLink.habitId(from: url) else { return false }
        return openQuitPanic(habitId: id, in: webView)
    }

    @discardableResult
    func openQuitPanic(habitId: String, in webView: WKWebView?) -> Bool {
        guard QuitFlag.isEnabled(), let path = QuitDeepLink.webPath(habitId: habitId), let webView,
              let target = URL(string: path, relativeTo: WidgetEnvironment.baseURL)?.absoluteURL,
              target.host == WidgetEnvironment.baseURL.host
        else { return false }
        webView.load(URLRequest(url: target))
        return true
    }

    func openPendingQuitPanic(in webView: WKWebView?) {
        if let id = QuitPendingPanic.take() { openQuitPanic(habitId: id, in: webView) }
    }
}
#endif
