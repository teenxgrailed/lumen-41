#if HABITS_QUIT
import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings
import NeedtKit

/// The app side of the quit blocker: individual Screen Time authorization,
/// the per-habit selection, the shield and its DeviceActivity schedule. Only
/// compiled when the project is built with `HABITS_QUIT` (see
/// `scripts/enable-habits-quit.rb`); until then none of this is in the app.
enum QuitBlocker {
    enum Authorization: String {
        case notDetermined, denied, approved
    }

    static var authorization: Authorization {
        switch AuthorizationCenter.shared.authorizationStatus {
        case .approved: return .approved
        case .denied: return .denied
        default: return .notDetermined
        }
    }

    /// Individual authorization: the person authorizes their own device with
    /// Face ID / Touch ID. No parent or child is involved.
    static func requestAuthorization() async throws {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
    }

    /// Saves the selection (and optional window) for a habit and puts its
    /// shield up now, or leaves it to the schedule when one is set.
    static func shield(habitId: String, selection: FamilyActivitySelection, schedule: QuitSchedule?) throws {
        guard QuitFlag.isEnabled(), authorization == .approved else { return }
        QuitSelectionRegistry().save(.init(selection: selection, schedule: schedule), habitId: habitId)
        let center = DeviceActivityCenter()
        if let name = QuitActivityName.name(habitId: habitId) {
            center.stopMonitoring([DeviceActivityName(name)])
        }
        if let schedule, let name = QuitActivityName.name(habitId: habitId) {
            let window = DeviceActivitySchedule(
                intervalStart: DateComponents(hour: schedule.startHour, minute: schedule.startMinute),
                intervalEnd: DateComponents(hour: schedule.endHour, minute: schedule.endMinute),
                repeats: true
            )
            try center.startMonitoring(DeviceActivityName(name), during: window)
            if schedule.contains(Date()) {
                QuitShieldController.apply(habitId: habitId, selection: selection)
            } else {
                QuitShieldController.clear(habitId: habitId)
            }
        } else {
            QuitShieldController.apply(habitId: habitId, selection: selection)
        }
    }

    static func remove(habitId: String) {
        if let name = QuitActivityName.name(habitId: habitId) {
            DeviceActivityCenter().stopMonitoring([DeviceActivityName(name)])
        }
        QuitShieldController.clear(habitId: habitId)
        QuitSelectionRegistry().remove(habitId: habitId)
        QuitStore.remove(habitId: habitId)
    }

    /// The flag went off (or the account changed): every shield comes down.
    static func removeAll() {
        for habitId in QuitSelectionRegistry().all().keys { remove(habitId: habitId) }
    }

    /// Habits that have a saved selection.
    static var habitIds: [String] { QuitSelectionRegistry().all().keys.sorted() }
}
#endif
