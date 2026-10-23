import Foundation

/// Priority level that determines how the live activity is rendered alongside
/// existing system activities (music, timer, reminders, etc.).
public enum IslandLiveActivityPriority: String, Codable, Sendable, Comparable {
    /// Low priority - may be hidden when high-priority activities are active
    case low
    
    /// Normal priority - displays alongside most activities
    case normal
    
    /// High priority - takes precedence over low/normal activities
    case high
    
    /// Critical priority - reserved for time-sensitive notifications
    /// (Use sparingly; may be rate-limited by Needt)
    case critical
    
    public static func < (lhs: IslandLiveActivityPriority, rhs: IslandLiveActivityPriority) -> Bool {
        lhs.rawPriority < rhs.rawPriority
    }
    
    private var rawPriority: Int {
        switch self {
        case .low: return 0
        case .normal: return 1
        case .high: return 2
        case .critical: return 3
        }
    }
}
