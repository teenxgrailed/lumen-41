import DeviceActivity
import Foundation
import NeedtKit

/// Puts a habit's shield up when its scheduled window starts and takes it down
/// when the window ends. Habits without a schedule never reach this extension
/// (their shield stays up until the app clears it). Callbacks for an account
/// without the `habits_quit` flag do nothing.
final class NeedtQuitMonitor: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        guard QuitFlag.isEnabled(), let habitId = QuitActivityName.habitId(from: activity.rawValue),
              let entry = QuitSelectionRegistry().entry(habitId: habitId)
        else { return }
        QuitShieldController.apply(habitId: habitId, selection: entry.selection)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard let habitId = QuitActivityName.habitId(from: activity.rawValue) else { return }
        QuitShieldController.clear(habitId: habitId)
    }
}
