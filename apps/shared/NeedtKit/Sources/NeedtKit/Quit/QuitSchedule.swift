import Foundation

/// When a habit's shield is up. `nil` (no schedule) means always. A window may
/// cross midnight (22:00 to 06:00). The DeviceActivity monitor puts the shield
/// up at `start` and takes it down at `end`, daily.
public struct QuitSchedule: Codable, Equatable, Sendable {
    public var startHour: Int
    public var startMinute: Int
    public var endHour: Int
    public var endMinute: Int

    public init?(startHour: Int, startMinute: Int, endHour: Int, endMinute: Int) {
        guard (0..<24).contains(startHour), (0..<24).contains(endHour),
              (0..<60).contains(startMinute), (0..<60).contains(endMinute),
              startHour * 60 + startMinute != endHour * 60 + endMinute
        else { return nil }
        self.startHour = startHour
        self.startMinute = startMinute
        self.endHour = endHour
        self.endMinute = endMinute
    }

    public var crossesMidnight: Bool { endHour * 60 + endMinute < startHour * 60 + startMinute }

    /// Whether the shield should be up at `date` (used to re-apply it when the
    /// monitor missed a callback).
    public func contains(_ date: Date, calendar: Calendar = .current) -> Bool {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        let now = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        let start = startHour * 60 + startMinute
        let end = endHour * 60 + endMinute
        return crossesMidnight ? (now >= start || now < end) : (now >= start && now < end)
    }
}

/// DeviceActivity names are `quit.<habitId>`, so the monitor extension can tell
/// which habit a callback is about.
public enum QuitActivityName {
    public static let prefix = "quit."

    public static func name(habitId: String) -> String? {
        QuitDeepLink.isValid(habitId: habitId) ? prefix + habitId : nil
    }

    public static func habitId(from name: String) -> String? {
        guard name.hasPrefix(prefix) else { return nil }
        let id = String(name.dropFirst(prefix.count))
        return QuitDeepLink.isValid(habitId: id) ? id : nil
    }
}
