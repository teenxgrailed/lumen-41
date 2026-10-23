import AppIntents
import NeedtKit
import SwiftUI
import WidgetKit

// The five widgets, one provider shape. A timeline is the same model function
// evaluated at the moments the picture changes (NeedtKit's WidgetTimelinePlan),
// so WidgetKit never needs a live clock: the only live numbers are
// Text(timerInterval:) and ProgressView(timerInterval:).

public struct NeedtEntry<Model: Sendable>: TimelineEntry {
    public let date: Date
    let model: Model
    let choices: WidgetChoices
    public var relevance: TimelineEntryRelevance?
}

struct NeedtProvider<Intent: WidgetChoicesProviding, Model: Sendable>: AppIntentTimelineProvider {
    typealias Entry = NeedtEntry<Model>

    let model: @Sendable (WidgetSnapshot?, WidgetStatus, Date) -> Model
    let dates: @Sendable (WidgetSnapshot?, Date) -> [Date]
    let relevance: @Sendable (Model) -> TimelineEntryRelevance?

    func placeholder(in context: Context) -> Entry {
        let now = Date()
        return Entry(date: now, model: model(nil, .placeholder, now), choices: WidgetChoices(), relevance: nil)
    }

    func snapshot(for configuration: Intent, in context: Context) async -> Entry {
        let now = Date()
        if context.isPreview {
            // The gallery: realistic simulated data, never the person's own.
            let sample = WidgetSamples.snapshot(now: now)
            return Entry(date: now, model: model(sample, .live, now), choices: configuration.choices, relevance: nil)
        }
        let load = await WidgetRepository().load(now: now)
        return Entry(date: now, model: model(load.snapshot, load.status, now), choices: configuration.choices, relevance: nil)
    }

    func timeline(for configuration: Intent, in context: Context) async -> Timeline<Entry> {
        let now = Date()
        let load = await WidgetRepository().load(now: now)
        let moments = dates(load.snapshot, now)
        let entries = moments.map { d -> Entry in
            let m = model(load.snapshot, load.status, d)
            return Entry(date: d, model: m, choices: configuration.choices, relevance: relevance(m))
        }
        let refresh = WidgetTimelinePlan.reload(after: moments.last ?? now, now: now)
        return Timeline(entries: entries, policy: .after(refresh))
    }
}

/// Builds the context from the environment and draws the routed style.
struct NeedtEntryView<Model: Sendable>: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetRenderingMode) private var mode
    @Environment(\.widgetFamily) private var family

    let entry: NeedtEntry<Model>
    let route: (Model, WidgetChoices, RenderContext) -> Rendered

    var body: some View {
        let ctx = RenderContext(scheme: scheme, mode: mode, family: NeedtFamily(family), now: entry.date,
                                showTitles: entry.choices.showTitlesOnLockScreen)
        let r = route(entry.model, entry.choices, ctx)
        r.content
            .environment(\.needt, r.context)
            .containerBackground(for: .widget) { r.background.environment(\.needt, r.context) }
    }
}

private func toggleFailed() -> Bool { WidgetFlash.isActive(.toggleFailed) }

// MARK: families per platform

private enum Families {
    static var today: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge, .accessoryRectangular, .accessoryInline]
        #else
        [.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge]
        #endif
    }
    static var next: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline]
        #else
        [.systemSmall, .systemMedium]
        #endif
    }
    static var focus: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular]
        #else
        [.systemSmall, .systemMedium]
        #endif
    }
    static var habits: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular]
        #else
        [.systemSmall, .systemMedium]
        #endif
    }
    static var quickAdd: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .accessoryCircular]
        #else
        [.systemSmall]
        #endif
    }
}

// MARK: widgets

public struct TodayWidget: Widget {
    public static let kind = "app.needt.widget.today"
    public init() {}

    public var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: Self.kind, intent: TodayConfigIntent.self,
            provider: NeedtProvider<TodayConfigIntent, TodayModel>(
                model: { snap, status, d in TodayModel.make(snapshot: snap, status: status, now: d, toggleFailed: toggleFailed()) },
                dates: { snap, now in WidgetTimelinePlan.today(snapshot: snap, now: now) },
                relevance: { _ in nil }
            )
        ) { entry in
            NeedtEntryView(entry: entry) { m, choices, ctx in StyleRegistry.today(m, choices: choices, context: ctx) }
        }
        .configurationDisplayName("Today")
        .description("See what is next on your day and mark tasks done.")
        .supportedFamilies(Families.today)
    }
}

public struct NextEventWidget: Widget {
    public static let kind = "app.needt.widget.next"
    public init() {}

    public var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: Self.kind, intent: NextConfigIntent.self,
            provider: NeedtProvider<NextConfigIntent, NextModel>(
                model: { snap, status, d in NextModel.make(snapshot: snap, status: status, now: d) },
                dates: { snap, now in WidgetTimelinePlan.next(snapshot: snap, now: now) },
                relevance: { m in TimelineEntryRelevance(score: m.state == .soon ? 90 : (m.state == .upcoming ? 40 : 5)) }
            )
        ) { entry in
            NeedtEntryView(entry: entry) { m, choices, ctx in StyleRegistry.next(m, choices: choices, context: ctx) }
        }
        .configurationDisplayName("Next event")
        .description("Check what starts next and how long until it does.")
        .supportedFamilies(Families.next)
    }
}

public struct FocusTimerWidget: Widget {
    public static let kind = "app.needt.widget.focus"
    public init() {}

    public var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: Self.kind, intent: FocusConfigIntent.self,
            provider: NeedtProvider<FocusConfigIntent, FocusModel>(
                model: { snap, status, d in FocusModel.make(snapshot: snap, status: status, now: d) },
                dates: { snap, now in WidgetTimelinePlan.focus(snapshot: snap, now: now) },
                relevance: { m in TimelineEntryRelevance(score: m.state == .running ? 100 : 0) }
            )
        ) { entry in
            NeedtEntryView(entry: entry) { m, choices, ctx in StyleRegistry.focus(m, choices: choices, context: ctx) }
        }
        .configurationDisplayName("Focus timer")
        .description("Start a focus block and watch the time run down.")
        .supportedFamilies(Families.focus)
    }
}

public struct HabitsWidget: Widget {
    public static let kind = "app.needt.widget.habits"
    public init() {}

    public var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: Self.kind, intent: HabitsConfigIntent.self,
            provider: NeedtProvider<HabitsConfigIntent, HabitsModel>(
                model: { snap, status, d in HabitsModel.make(snapshot: snap, status: status, now: d) },
                dates: { snap, now in WidgetTimelinePlan.habits(snapshot: snap, now: now) },
                relevance: { _ in nil }
            )
        ) { entry in
            NeedtEntryView(entry: entry) { m, choices, ctx in StyleRegistry.habits(m, choices: choices, context: ctx) }
        }
        .configurationDisplayName("Habits")
        .description("Log today's habits and keep your streaks going.")
        .supportedFamilies(Families.habits)
    }
}

public struct QuickAddWidget: Widget {
    public static let kind = "app.needt.widget.quickadd"
    public init() {}

    public var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: Self.kind, intent: QuickAddConfigIntent.self,
            provider: NeedtProvider<QuickAddConfigIntent, QuickAddModel>(
                model: { _, status, _ in QuickAddModel.make(status: status) },
                dates: { _, now in [now] },
                relevance: { _ in nil }
            )
        ) { entry in
            NeedtEntryView(entry: entry) { m, choices, ctx in StyleRegistry.quickAdd(m, choices: choices, context: ctx) }
        }
        .configurationDisplayName("Quick add")
        .description("Open Needt on the capture screen to add a task.")
        .supportedFamilies(Families.quickAdd)
    }
}

// MARK: Controls (Control Center, Lock Screen, Action button, Mac menu bar)

@available(iOS 18.0, macOS 26.0, *)
public struct QuickAddControl: ControlWidget {
    public static let kind = "app.needt.control.quickadd"
    public init() {}

    public var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickAddIntent()) {
                Label("Add task", systemImage: "plus")
            }
        }
        .displayName("Add task")
        .description("Opens Needt on the capture screen.")
    }
}

@available(iOS 18.0, macOS 26.0, *)
public struct StartFocusControl: ControlWidget {
    public static let kind = "app.needt.control.focus"
    public init() {}

    public var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartFocusWidgetIntent(minutes: FocusFilterState.defaultMinutes)) {
                Label("Start focus", systemImage: "timer")
            }
        }
        .displayName("Start focus")
        .description("Starts a focus block.")
    }
}

// MARK: bundle

public struct NeedtWidgetBundle: WidgetBundle {
    public init() {}

    public var body: some Widget {
        TodayWidget()
        NextEventWidget()
        FocusTimerWidget()
        HabitsWidget()
        QuickAddWidget()
        // Controls and the Live Activity are iPhone only here. On macOS 26 the
        // Controls need the extension itself to target macOS 26: the
        // `if #available` builder path does not link below that (//todo).
        #if os(iOS)
        if #available(iOS 18.0, *) {
            QuickAddControl()
            StartFocusControl()
        }
        FocusLiveActivity()
        #endif
    }
}

/// The App Intents the widgets use, declared once so the metadata extractor of
/// each host target finds them in this package.
public struct NeedtWidgetsIntentsPackage: AppIntentsPackage {
    #if os(iOS)
    public static var includedPackages: [any AppIntentsPackage.Type] { [NeedtKitIntentsPackage.self] }
    #endif
}
