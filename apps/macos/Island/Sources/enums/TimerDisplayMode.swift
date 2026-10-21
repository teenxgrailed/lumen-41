import Defaults

public enum TimerDisplayMode: String, CaseIterable, Defaults.Serializable, Identifiable {
    case tab
    case popover

    public var id: String { rawValue }

    var displayName: String {
        switch self {
        case .tab:
            return String(localized:"Tab")
        case .popover:
            return String(localized:"Popover")
        }
    }

    var description: String {
        switch self {
        case .tab:
            return "Shows timer controls as a dedicated tab inside the open notch."
        case .popover:
            return "Keeps the current popover button beside the notch instead of adding a tab."
        }
    }
}
