import AppIntents
import NeedtKit
import SwiftUI
import WidgetKit

// What the widget's Edit menu offers: the style (D · Ink by default), the
// "Show titles on Lock Screen" switch (off by default), and the layout
// alternatives of one size.

public enum StyleChoice: String, AppEnum, CaseIterable {
    case sky, pixel, bento, cat, noir, mist, rim, ink

    public static var typeDisplayRepresentation: TypeDisplayRepresentation { "Style" }
    public static var caseDisplayRepresentations: [StyleChoice: DisplayRepresentation] {
        [.sky: "A · Sky", .pixel: "B · Pixel", .bento: "C · Bento", .cat: "E · Lucky cat",
         .noir: "F · Noir", .mist: "G · Mist", .rim: "H · Rim", .ink: "D · Ink"]
    }

    var id: StyleID { StyleID(rawValue: rawValue) ?? .ink }
}

public enum TodayLayoutChoice: String, AppEnum, CaseIterable {
    case standard, tray
    public static var typeDisplayRepresentation: TypeDisplayRepresentation { "Medium layout" }
    public static var caseDisplayRepresentations: [TodayLayoutChoice: DisplayRepresentation] {
        [.standard: "Tasks and next event", .tray: "Tray (D · Ink)"]
    }
}

public enum HabitsLayoutChoice: String, AppEnum, CaseIterable {
    case today, history
    public static var typeDisplayRepresentation: TypeDisplayRepresentation { "Medium layout" }
    public static var caseDisplayRepresentations: [HabitsLayoutChoice: DisplayRepresentation] {
        [.today: "Today's check-ins", .history: "Last 4 weeks (D · Ink)"]
    }
}

public enum QuickAddLayoutChoice: String, AppEnum, CaseIterable {
    case open, prompt
    public static var typeDisplayRepresentation: TypeDisplayRepresentation { "Layout" }
    public static var caseDisplayRepresentations: [QuickAddLayoutChoice: DisplayRepresentation] {
        [.open: "Add mark", .prompt: "Prompt line (D · Ink)"]
    }
}

protocol WidgetChoicesProviding: WidgetConfigurationIntent {
    var choices: WidgetChoices { get }
}

public struct TodayConfigIntent: WidgetConfigurationIntent, WidgetChoicesProviding {
    public static var title: LocalizedStringResource { "Today" }
    public static var description: IntentDescription { IntentDescription("Choose how Today looks.") }

    @Parameter(title: "Style", default: .ink) public var style: StyleChoice
    @Parameter(title: "Medium layout", default: .standard) public var layout: TodayLayoutChoice
    @Parameter(title: "Show titles on Lock Screen", default: false) public var showTitlesOnLockScreen: Bool

    public init() {}

    var choices: WidgetChoices {
        WidgetChoices(style: style.id, showTitlesOnLockScreen: showTitlesOnLockScreen,
                      todayMedium: TodayMediumLayout(rawValue: layout.rawValue) ?? .standard)
    }
}

public struct NextConfigIntent: WidgetConfigurationIntent, WidgetChoicesProviding {
    public static var title: LocalizedStringResource { "Next event" }
    public static var description: IntentDescription { IntentDescription("Choose how Next event looks.") }

    @Parameter(title: "Style", default: .ink) public var style: StyleChoice
    @Parameter(title: "Show titles on Lock Screen", default: false) public var showTitlesOnLockScreen: Bool

    public init() {}

    var choices: WidgetChoices { WidgetChoices(style: style.id, showTitlesOnLockScreen: showTitlesOnLockScreen) }
}

public struct FocusConfigIntent: WidgetConfigurationIntent, WidgetChoicesProviding {
    public static var title: LocalizedStringResource { "Focus timer" }
    public static var description: IntentDescription { IntentDescription("Choose how the Focus timer looks.") }

    @Parameter(title: "Style", default: .ink) public var style: StyleChoice
    @Parameter(title: "Show titles on Lock Screen", default: false) public var showTitlesOnLockScreen: Bool

    public init() {}

    var choices: WidgetChoices { WidgetChoices(style: style.id, showTitlesOnLockScreen: showTitlesOnLockScreen) }
}

public struct HabitsConfigIntent: WidgetConfigurationIntent, WidgetChoicesProviding {
    public static var title: LocalizedStringResource { "Habits" }
    public static var description: IntentDescription { IntentDescription("Choose how Habits looks.") }

    @Parameter(title: "Style", default: .ink) public var style: StyleChoice
    @Parameter(title: "Medium layout", default: .today) public var layout: HabitsLayoutChoice
    @Parameter(title: "Show titles on Lock Screen", default: false) public var showTitlesOnLockScreen: Bool

    public init() {}

    var choices: WidgetChoices {
        WidgetChoices(style: style.id, showTitlesOnLockScreen: showTitlesOnLockScreen,
                      habitsMedium: HabitsMediumLayout(rawValue: layout.rawValue) ?? .today)
    }
}

public struct QuickAddConfigIntent: WidgetConfigurationIntent, WidgetChoicesProviding {
    public static var title: LocalizedStringResource { "Quick add" }
    public static var description: IntentDescription { IntentDescription("Choose how Quick add looks.") }

    @Parameter(title: "Style", default: .ink) public var style: StyleChoice
    @Parameter(title: "Layout", default: .open) public var layout: QuickAddLayoutChoice

    public init() {}

    var choices: WidgetChoices {
        WidgetChoices(style: style.id, quickAdd: QuickAddLayout(rawValue: layout.rawValue) ?? .open)
    }
}
