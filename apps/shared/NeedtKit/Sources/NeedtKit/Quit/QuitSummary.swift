import Foundation

/// The next milestone of a quit habit. The shape on the wire is not final (the
/// quit-summary route is being built in a parallel change), so decoding takes a
/// plain string ("30 days"), a number (days) or an object with `label` / `days`.
public struct QuitMilestone: Codable, Equatable, Sendable {
    public var label: String?
    public var days: Int?

    public init(label: String? = nil, days: Int? = nil) {
        self.label = label
        self.days = days
    }

    private enum CodingKeys: String, CodingKey { case label, days }

    public init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer() {
            if let text = try? single.decode(String.self) { self.init(label: text); return }
            if let number = try? single.decode(Int.self) { self.init(days: number); return }
        }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(label: try c.decodeIfPresent(String.self, forKey: .label),
                  days: try c.decodeIfPresent(Int.self, forKey: .days))
    }
}

/// `GET /api/habits/[id]/quit-summary`:
/// `{ currentStreakDays, currentStreakHours, reason, nextMilestone }`.
/// `currentStreakHours` is read as the hours part of the streak (0...23) next to
/// the whole days, not the total (assumption until the route lands). Every field
/// but the streak may be missing.
public struct QuitSummary: Codable, Equatable, Sendable {
    public var currentStreakDays: Int
    public var currentStreakHours: Int
    public var reason: String?
    public var nextMilestone: QuitMilestone?

    public init(currentStreakDays: Int, currentStreakHours: Int, reason: String? = nil, nextMilestone: QuitMilestone? = nil) {
        self.currentStreakDays = currentStreakDays
        self.currentStreakHours = currentStreakHours
        self.reason = reason
        self.nextMilestone = nextMilestone
    }

    /// Whole hours in the streak.
    public var totalHours: Int { max(0, currentStreakDays) * 24 + min(max(0, currentStreakHours), 23) }
}

/// What the app leaves for the shield extensions: the summary as of
/// `fetchedAt`. A shield can stay up for hours, so the streak is advanced by
/// the time since the fetch instead of showing a frozen number.
public struct QuitRecord: Codable, Equatable, Sendable {
    public var habitId: String
    public var summary: QuitSummary
    public var fetchedAt: Date

    public init(habitId: String, summary: QuitSummary, fetchedAt: Date) {
        self.habitId = habitId
        self.summary = summary
        self.fetchedAt = fetchedAt
    }

    public func streak(at now: Date) -> (days: Int, hours: Int) {
        let extra = max(0, Int(now.timeIntervalSince(fetchedAt) / 3600))
        let total = summary.totalHours + extra
        return (total / 24, total % 24)
    }
}
