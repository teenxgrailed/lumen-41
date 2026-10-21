#if os(macOS)
import AppKit
import Foundation
import NeedtKit
import SwiftUI
import Testing
import WidgetKit
@testable import NeedtWidgetKit

/// Renders every style, widget, family and state with SwiftUI's ImageRenderer
/// into PNGs (NEEDT_SNAPSHOT_DIR, else a temp folder) and an index.html, so the
/// output can be compared with `additions-2/widgets/pack.html` and the lab. CI
/// uploads the folder as the `needt-widget-snapshots` artifact.
@MainActor
@Suite(.serialized) struct SnapshotTests {
    let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        c.locale = Locale(identifier: "en_US")
        return c
    }()
    var now: Date { WidgetSamples.now(calendar: cal) }
    var sample: WidgetSnapshot { WidgetSamples.snapshot(now: now, calendar: cal) }

    func at(_ h: Int, _ m: Int) -> Date { cal.date(bySettingHour: h, minute: m, second: 0, of: now)! }

    var outDir: URL {
        if let p = ProcessInfo.processInfo.environment["NEEDT_SNAPSHOT_DIR"], !p.isEmpty {
            return URL(fileURLWithPath: p, isDirectory: true)
        }
        return FileManager.default.temporaryDirectory.appendingPathComponent("needt-snapshots", isDirectory: true)
    }

    // MARK: rendering

    func context(_ family: NeedtFamily, scheme: ColorScheme = .light, mode: WidgetRenderingMode = .fullColor,
                 date: Date? = nil) -> RenderContext {
        RenderContext(scheme: scheme, mode: mode, family: family, now: date ?? now, showTitles: true,
                      isSnapshot: true, calendar: cal)
    }

    /// Draws `r` the way WidgetKit hosts it: content margin, container
    /// background, the system corner radius.
    func frame(_ r: Rendered, redacted: Bool = false) -> some View {
        let family = r.context.family
        let size = family.size
        let margin: CGFloat = family.isSystem ? 16 : 0
        let radius: CGFloat = family.isSystem ? 24 : (family == .circular || family == .control ? size.width / 2 : 14)
        let accessory = family.isAccessory || family == .control
        let c = r.context
        return r.content
            .environment(\.needt, c)
            .environment(\.redactionReasons, redacted ? .privacy : [])
            .padding(margin)
            .frame(width: size.width, height: size.height)
            .background {
                if accessory {
                    Color.white.opacity(0.14)
                } else if c.isFullColor {
                    r.background.environment(\.needt, c)
                } else if c.mode == .accented {
                    Color.white.opacity(0.14)
                } else {
                    Color.white.opacity(0.08)
                }
            }
            .foregroundStyle(accessory || !c.isFullColor ? Color.white : c.palette.ink)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    /// The wallpaper a widget sits on in that mode.
    func wall<Content: View>(_ c: RenderContext, @ViewBuilder _ content: () -> Content) -> some View {
        let pad: CGFloat = c.isFullColor && !c.family.isAccessory ? 18 : 18
        return content()
            .padding(pad)
            .background {
                switch (c.mode, c.isFullColor) {
                case (_, true) where !c.family.isAccessory:
                    (c.isDark ? Color(rgb: 0x0C0B14) : Color(rgb: 0xE9E8EF))
                case (.vibrant, _):
                    LinearGradient(colors: [Color(rgb: 0x15141F), Color(rgb: 0x0A0A10)], startPoint: .topLeading, endPoint: .bottomTrailing)
                default:
                    LinearGradient(colors: [Color(rgb: 0x3D4A8A), Color(rgb: 0x2A2440), Color(rgb: 0xB0688A)], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
    }

    func write<V: View>(_ view: V, named name: String) {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        renderer.proposedSize = .unspecified
        guard let cg = renderer.cgImage else { Issue.record("no image for \(name)"); return }
        let rep = NSBitmapImageRep(cgImage: cg)
        guard let data = rep.representation(using: .png, properties: [:]) else { Issue.record("no png for \(name)"); return }
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        try? data.write(to: outDir.appendingPathComponent(name + ".png"))
    }

    func shoot(_ r: Rendered, _ name: String, redacted: Bool = false) {
        write(wall(r.context) { frame(r, redacted: redacted) }.environment(\.colorScheme, r.context.scheme), named: name)
    }

    // MARK: model helpers

    func today(_ mutate: (inout WidgetSnapshot) -> Void = { _ in }, status: WidgetStatus = .live,
               failed: Bool = false, date: Date? = nil) -> TodayModel {
        var s = sample
        mutate(&s)
        return TodayModel.make(snapshot: s, status: status, now: date ?? now, toggleFailed: failed, calendar: cal)
    }

    func next(_ mutate: (inout WidgetSnapshot) -> Void = { _ in }, status: WidgetStatus = .live, date: Date? = nil) -> NextModel {
        var s = sample
        mutate(&s)
        return NextModel.make(snapshot: s, status: status, now: date ?? now, calendar: cal)
    }

    func focusModel(_ f: WidgetFocus?, status: WidgetStatus = .live, date: Date? = nil) -> FocusModel {
        var s = sample
        s.focus = f
        return FocusModel.make(snapshot: s, status: status, now: date ?? now)
    }

    func habits(_ mutate: (inout WidgetSnapshot) -> Void = { _ in }, status: WidgetStatus = .live, date: Date? = nil) -> HabitsModel {
        var s = sample
        mutate(&s)
        return HabitsModel.make(snapshot: s, status: status, now: date ?? now, calendar: cal)
    }

    // MARK: the run

    @Test func renderEverything() throws {
        try? FileManager.default.removeItem(at: outDir)
        let ink = WidgetChoices(style: .ink)
        for scheme in [ColorScheme.light, .dark] {
            let s = scheme == .dark ? "dark" : "light"
            inkFamilies(ink, scheme, s)
            inkStates(ink, scheme, s)
            for style in StyleID.allCases { styleBoard(style, scheme, s) }
        }
        inkModes(ink)
        inkLockScreen(ink)
        writeIndex()
        let count = (try? FileManager.default.contentsOfDirectory(atPath: outDir.path).filter { $0.hasSuffix(".png") }.count) ?? 0
        #expect(count > 100)
    }

    func inkFamilies(_ ink: WidgetChoices, _ scheme: ColorScheme, _ s: String) {
        for fam in [NeedtFamily.small, .medium, .large, .extraLarge] {
            shoot(StyleRegistry.today(today(), choices: ink, context: context(fam, scheme: scheme)), "ink-today-\(fam.rawValue)-normal-\(s)")
        }
        var tray = ink; tray.todayMedium = .tray
        shoot(StyleRegistry.today(today(), choices: tray, context: context(.medium, scheme: scheme)), "ink-today-medium-tray-\(s)")
        var hist = ink; hist.habitsMedium = .history
        shoot(StyleRegistry.habits(habits(), choices: hist, context: context(.medium, scheme: scheme)), "ink-habits-medium-history-\(s)")
        var prompt = ink; prompt.quickAdd = .prompt
        shoot(StyleRegistry.quickAdd(QuickAddModel.make(status: .live), choices: prompt, context: context(.small, scheme: scheme)), "ink-quickadd-small-prompt-\(s)")
        shoot(StyleRegistry.next(next(), choices: ink, context: context(.medium, scheme: scheme)), "ink-next-medium-normal-\(s)")
        shoot(StyleRegistry.focus(focusModel(sample.focus), choices: ink, context: context(.medium, scheme: scheme)), "ink-focus-medium-running-\(s)")
        shoot(StyleRegistry.habits(habits(), choices: ink, context: context(.medium, scheme: scheme)), "ink-habits-medium-pro3-\(s)")
        shoot(StyleRegistry.habits(habits({ s in
            s.habits += [WidgetHabit(id: "h4", title: "Water", doneToday: false, streak: 0, history: []),
                         WidgetHabit(id: "h5", title: "Journal", doneToday: true, streak: 1, history: [true])]
        }), choices: ink, context: context(.medium, scheme: scheme)), "ink-habits-medium-pro5-\(s)")
        shoot(StyleRegistry.habits(habits({ s in
            s.plan = .free
            s.habits += [WidgetHabit(id: "h4", title: "Water", doneToday: false, streak: 0, history: [])]
        }), choices: ink, context: context(.medium, scheme: scheme)), "ink-habits-medium-free3-\(s)")
    }

    func inkStates(_ ink: WidgetChoices, _ scheme: ColorScheme, _ s: String) {
        func t(_ m: TodayModel, _ n: String) { shoot(StyleRegistry.today(m, choices: ink, context: context(.small, scheme: scheme)), "ink-today-small-\(n)-\(s)") }
        t(today(), "normal")
        t(today { $0.tasks = $0.tasks.map { TaskSummary(id: $0.id, title: $0.title, status: "completed", scheduledStart: $0.scheduledStart, completedAt: $0.scheduledStart) } }, "alldone")
        t(today { $0.tasks = [] ; $0.events = [] }, "nothingplanned")
        t(today { s in
            s.tasks = [TaskSummary(id: "o1", title: "Send invoices for August", status: "todo", scheduledStart: cal.date(byAdding: .day, value: -2, to: at(9, 0))),
                       TaskSummary(id: "o2", title: "Renew the domain", status: "todo", scheduledStart: cal.date(byAdding: .day, value: -1, to: at(9, 0))),
                       TaskSummary(id: "o3", title: "Write the weekly report", status: "todo", scheduledStart: at(15, 0))]
        }, "overdue")
        t(TodayModel.placeholder(now: now, calendar: cal), "placeholder")
        t(today(status: .signedOut), "signedout")
        t(today(status: .stale(at(14, 5))), "stale")
        t(today(failed: true), "togglefailed")
        shoot(StyleRegistry.today(today(), choices: ink, context: context(.small, scheme: scheme)), "ink-today-small-redacted-\(s)", redacted: true)

        func n(_ m: NextModel, _ name: String) { shoot(StyleRegistry.next(m, choices: ink, context: context(.small, scheme: scheme)), "ink-next-small-\(name)-\(s)") }
        n(next(), "upcoming")
        n(next(date: at(14, 52)), "soon")
        n(next(date: at(15, 21)), "inprogress")
        n(next { $0.events = [] }, "none")
        n(next { s in
            s.events = [WidgetEvent(id: "ad", title: "Dentist week", start: at(0, 0), end: at(0, 0).addingTimeInterval(86400), allDay: true)]
        }, "alldayonly")
        n(next { $0.events.append(WidgetEvent(id: "e3", title: "Design review", start: self.at(15, 30), end: self.at(16, 30))) }, "conflict")
        n(next(status: .signedOut), "signedout")

        func f(_ m: FocusModel, _ name: String) { shoot(StyleRegistry.focus(m, choices: ink, context: context(.small, scheme: scheme)), "ink-focus-small-\(name)-\(s)") }
        let run = sample.focus
        f(focusModel(nil), "idle")
        f(focusModel(run), "running")
        f(focusModel(run.map { WidgetFocus(sessionId: $0.sessionId, title: $0.title, taskId: nil, plannedMinutes: 25, startedAt: $0.startedAt, pausedAt: now) }), "paused")
        f(focusModel(WidgetFocus(sessionId: "x", title: "Deep work", taskId: nil, plannedMinutes: 25, startedAt: at(13, 40))), "finished")
        f(focusModel(nil, status: .signedOut), "signedout")

        func h(_ m: HabitsModel, _ name: String) { shoot(StyleRegistry.habits(m, choices: ink, context: context(.small, scheme: scheme)), "ink-habits-small-\(name)-\(s)") }
        h(habits { s in s.habits = s.habits.map { WidgetHabit(id: $0.id, title: $0.title, doneToday: false, streak: 0, history: []) } }, "nonelogged")
        h(habits(), "partial")
        h(habits { s in s.habits = s.habits.map { WidgetHabit(id: $0.id, title: $0.title, doneToday: true, streak: $0.streak, history: $0.history) } }, "alldone")
        h(habits { $0.habits = [] }, "nohabits")
        h(habits(date: at(19, 0)), "atrisk")

        func q(_ st: WidgetStatus, _ name: String) { shoot(StyleRegistry.quickAdd(QuickAddModel.make(status: st), choices: ink, context: context(.small, scheme: scheme)), "ink-quickadd-small-\(name)-\(s)") }
        q(.live, "default"); q(.signedOut, "signedout"); q(.stale(at(14, 5)), "offline")
        shoot(StyleRegistry.quickAdd(QuickAddModel.make(status: .live), choices: ink, context: context(.control, scheme: scheme)), "ink-quickadd-control-default-\(s)")
    }

    /// One board per style: small and medium of every widget.
    func styleBoard(_ style: StyleID, _ scheme: ColorScheme, _ s: String) {
        let choices = WidgetChoices(style: style)
        for fam in [NeedtFamily.small, .medium] {
            let n = fam.rawValue
            shoot(StyleRegistry.today(today(), choices: choices, context: context(fam, scheme: scheme)), "\(style.rawValue)-today-\(n)-\(s)")
            shoot(StyleRegistry.next(next(), choices: choices, context: context(fam, scheme: scheme)), "\(style.rawValue)-next-\(n)-\(s)")
            shoot(StyleRegistry.focus(focusModel(sample.focus), choices: choices, context: context(fam, scheme: scheme)), "\(style.rawValue)-focus-\(n)-\(s)")
            shoot(StyleRegistry.habits(habits(), choices: choices, context: context(fam, scheme: scheme)), "\(style.rawValue)-habits-\(n)-\(s)")
        }
        shoot(StyleRegistry.quickAdd(QuickAddModel.make(status: .live), choices: choices, context: context(.small, scheme: scheme)), "\(style.rawValue)-quickadd-small-\(s)")
        shoot(StyleRegistry.quickAdd(QuickAddModel.make(status: .live), choices: choices, context: context(.control, scheme: scheme)), "\(style.rawValue)-quickadd-control-\(s)")
    }

    /// pack.html -> Rendering modes. Every style falls back to Ink here.
    func inkModes(_ ink: WidgetChoices) {
        for (name, mode, scheme) in [("tinted", WidgetRenderingMode.accented, ColorScheme.dark), ("vibrant", .vibrant, .dark)] {
            shoot(StyleRegistry.today(today(), choices: ink, context: context(.medium, scheme: scheme, mode: mode)), "mode-ink-today-medium-\(name)")
            shoot(StyleRegistry.focus(focusModel(sample.focus), choices: ink, context: context(.small, scheme: scheme, mode: mode)), "mode-ink-focus-small-\(name)")
        }
        for style in [StyleID.sky, .noir, .mist] {
            let c = WidgetChoices(style: style)
            shoot(StyleRegistry.today(today(), choices: c, context: context(.medium, scheme: .dark, mode: .accented)), "mode-\(style.rawValue)-today-medium-tinted-fallback")
        }
    }

    func inkLockScreen(_ ink: WidgetChoices) {
        for (redacted, name) in [(false, "unlocked"), (true, "locked")] {
            for fam in [NeedtFamily.circular, .rectangular, .inline] {
                let c = context(fam, scheme: .dark, mode: .vibrant)
                var choices = ink
                choices.showTitlesOnLockScreen = !redacted
                var ctx = c; ctx.showTitles = !redacted
                shoot(StyleRegistry.today(today(), choices: choices, context: ctx), "lock-today-\(fam.rawValue)-\(name)", redacted: redacted)
                shoot(StyleRegistry.next(next(), choices: choices, context: ctx), "lock-next-\(fam.rawValue)-\(name)", redacted: redacted)
                shoot(StyleRegistry.focus(focusModel(sample.focus), choices: choices, context: ctx), "lock-focus-\(fam.rawValue)-\(name)", redacted: redacted)
                shoot(StyleRegistry.habits(habits(), choices: choices, context: ctx), "lock-habits-\(fam.rawValue)-\(name)", redacted: redacted)
            }
        }
        shoot(StyleRegistry.quickAdd(QuickAddModel.make(status: .live), choices: ink, context: context(.circular, scheme: .dark, mode: .vibrant)), "lock-quickadd-circular")
    }

    func writeIndex() {
        let files = ((try? FileManager.default.contentsOfDirectory(atPath: outDir.path)) ?? []).filter { $0.hasSuffix(".png") }.sorted()
        var html = "<!doctype html><meta charset=utf-8><title>Needt widget snapshots</title><style>body{font:13px -apple-system,sans-serif;margin:20px;background:#eee}figure{display:inline-block;margin:8px;vertical-align:top}img{display:block;max-width:760px}figcaption{font-size:11px;color:#555}</style><h1>Needt widget snapshots</h1><p>Rendered with ImageRenderer in CI. Compare with additions-2/widgets/pack.html and index.html.</p>"
        for f in files { html += "<figure><img src=\"\(f)\" loading=lazy><figcaption>\(f)</figcaption></figure>" }
        try? html.write(to: outDir.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    }
}
#endif
