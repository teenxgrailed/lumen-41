import Foundation

/// The alternative layouts of one size that the lab ships next to the pack's.
/// They are choices in the widget's Edit menu, like the style.
public enum TodayMediumLayout: String, CaseIterable, Sendable {
    /// Three tasks and the next event (pack.html).
    case standard
    /// The task cards stacked in a tray with a count (lab D2).
    case tray
}

public enum HabitsMediumLayout: String, CaseIterable, Sendable {
    /// One card per habit with today's check (pack.html, Free 3 / Pro 4+).
    case today
    /// Four weeks of check-ins per habit (lab D8).
    case history
}

public enum QuickAddLayout: String, CaseIterable, Sendable {
    /// Plus mark, "Add a task", "Opens Needt" (pack.html).
    case open
    /// A prompt line with an Add pill (lab D10). Still only opens the app.
    case prompt
}

/// What the person chose in the widget's Edit menu, carried on every entry.
public struct WidgetChoices: Equatable, Sendable {
    public var style: StyleID
    public var showTitlesOnLockScreen: Bool
    public var todayMedium: TodayMediumLayout
    public var habitsMedium: HabitsMediumLayout
    public var quickAdd: QuickAddLayout

    public init(style: StyleID = .ink, showTitlesOnLockScreen: Bool = false, todayMedium: TodayMediumLayout = .standard,
                habitsMedium: HabitsMediumLayout = .today, quickAdd: QuickAddLayout = .open) {
        self.style = style
        self.showTitlesOnLockScreen = showTitlesOnLockScreen
        self.todayMedium = todayMedium
        self.habitsMedium = habitsMedium
        self.quickAdd = quickAdd
    }
}

/// The eight styles of the lab, in the order the Edit menu lists them. D · Ink
/// is the default.
public enum StyleID: String, CaseIterable, Sendable {
    case sky, pixel, bento, cat, noir, mist, rim, ink

    public var title: String {
        switch self {
        case .sky: return "A · Sky"
        case .pixel: return "B · Pixel"
        case .bento: return "C · Bento"
        case .cat: return "E · Lucky cat"
        case .noir: return "F · Noir"
        case .mist: return "G · Mist"
        case .rim: return "H · Rim"
        case .ink: return "D · Ink"
        }
    }
}
