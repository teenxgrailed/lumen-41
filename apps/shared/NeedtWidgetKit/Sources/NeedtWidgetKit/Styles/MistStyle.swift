import NeedtKit
import SwiftUI
import WidgetKit

/// G · Mist: frosted white type over slowly drifting blurred colour (sage,
/// rose, fog, dusk), a thin ring as the icon, big bold numbers with small
/// units. Type: Unbounded (numbers, labels) and Fraunces Italic (titles, units).
struct MistStyle: WidgetStyle {
    var id: StyleID { .mist }
    var fonts: StyleFonts {
        StyleFonts(body: FontSpec(name: "Fraunces", design: .serif, italic: true), display: FontSpec(name: "Unbounded", design: .rounded),
                   mono: FontSpec(design: .monospaced))
    }

    enum Palette {
        case sage, rose, fog, sky
        var colors: [RGB] {
            switch self {
            case .sage: return [RGB(0x3E4A2B), RGB(0xB9C86B), RGB(0x6F7D4A)]
            case .rose: return [RGB(0x8F9AA6), RGB(0xC99B98), RGB(0x6F7D86)]
            case .fog: return [RGB(0xA7AAB2), RGB(0x9A7F84), RGB(0x55565F)]
            case .sky: return [RGB(0x7E90B8), RGB(0xC9B6D6), RGB(0x4E5A7A)]
            }
        }
    }

    static func palette(_ kind: NeedtWidgetKind, family: NeedtFamily) -> Palette {
        switch (kind, family) {
        case (.today, .medium): return .rose
        case (.today, _): return .sage
        case (.next, .medium): return .sky
        case (.next, _): return .fog
        case (.focus, .medium): return .rose
        case (.focus, _): return .sage
        case (.habits, .medium): return .fog
        case (.habits, _): return .sky
        case (.quickAdd, .control): return .sage
        case (.quickAdd, _): return .rose
        }
    }

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        AnyView(MistBackground(palette: Self.palette(kind, family: ctx.family)))
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { AnyView(MistToday(model: model)) }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { AnyView(MistNext(model: model)) }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(MistFocus(model: model)) }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { AnyView(MistHabits(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { AnyView(MistQuickAdd()) }
}

/// Three blurred colour fields over a base, a soft light from above.
struct MistBackground: View {
    var palette: MistStyle.Palette

    var body: some View {
        let c = palette.colors
        return GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                c[2].color()
                Circle().fill(RadialGradient(colors: [c[0].color(), c[0].color(0)], center: .center, startRadius: 0, endRadius: max(w, h) * 0.5))
                    .frame(width: max(w, h), height: max(w, h)).position(x: w * 0.25, y: h * 0.3)
                Circle().fill(RadialGradient(colors: [c[1].color(), c[1].color(0)], center: .center, startRadius: 0, endRadius: max(w, h) * 0.55))
                    .frame(width: max(w, h) * 1.1, height: max(w, h) * 1.1).position(x: w * 0.75, y: h * 0.7)
                Circle().fill(RadialGradient(colors: [c[2].color(), c[2].color(0)], center: .center, startRadius: 0, endRadius: max(w, h) * 0.6))
                    .frame(width: max(w, h) * 1.2, height: max(w, h) * 1.2).position(x: w * 0.6, y: h * 0.2)
            }
            .blur(radius: 18)
            .overlay(LinearGradient(colors: [.white.opacity(0.14), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.4)))
            .clipped()
        }
    }
}

private struct MistRing: View {
    var progress: Double
    var symbol: String

    var body: some View {
        ZStack {
            ColorRing(progress: progress, diameter: 33, lineWidth: 1.6, color: .white.opacity(0.9), track: .white.opacity(0.18))
            Circle().fill(Color.white.opacity(0.18)).frame(width: 20, height: 20)
                .overlay(Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 0.5))
                .overlay(Image(systemName: symbol).font(.system(size: 9, weight: .bold)).foregroundStyle(.white))
        }
        .frame(width: 35, height: 35)
    }
}

struct MistMetric: Identifiable {
    var id: String { label }
    var label: String
    var value: AnyView
    var unit: String
}

/// The one shape of every Mist widget: ring + title on top, metrics below.
private struct MistCard: View {
    @Environment(\.needt) private var c
    var progress: Double
    var symbol: String
    var title: String
    var metrics: [MistMetric]
    var numberSize: CGFloat? = nil
    var spacing: CGFloat = 18

    var body: some View {
        let size = numberSize ?? (c.family == .medium ? 32 : 30)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: c.family == .medium ? 12 : 10) {
                MistRing(progress: progress, symbol: symbol)
                Text(title).font(c.fonts.body.font(16, weight: .medium)).tracking(-0.2).lineLimit(2).shadow(color: .black.opacity(0.15), radius: 4, y: 1)
                    .titleSensitive(c.showTitles)
            }
            Spacer(minLength: 0)
            HStack(alignment: .bottom, spacing: c.family == .medium ? 34 : spacing) {
                ForEach(metrics) { m in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.label).font(c.fonts.display.font(10.5, weight: .medium)).tracking(0.2).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            m.value.font(c.fonts.display.font(size, weight: .bold)).tracking(-size * 0.04).lineLimit(1).minimumScaleFactor(0.6)
                            if !m.unit.isEmpty { Text(m.unit).font(c.fonts.body.font(13, weight: .medium)) }
                        }
                    }
                }
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private func text(_ s: String) -> AnyView { AnyView(Text(s)) }

struct MistToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        let total = max(1, model.left + model.done)
        if c.family == .medium {
            MistCard(progress: Double(model.done) / Double(total), symbol: "checkmark", title: "\(model.weekday)\n\(model.dateLabel)",
                     metrics: [MistMetric(label: "Left", value: text("\(model.left)"), unit: "tasks"),
                               MistMetric(label: "Today", value: text("\(model.freeHours ?? 0)"), unit: "h free"),
                               MistMetric(label: "Done", value: text("\(model.done)"), unit: "")])
                .widgetURL(NeedtLink.today)
        } else {
            MistCard(progress: Double(model.done) / Double(total), symbol: "checkmark", title: "Today",
                     metrics: [MistMetric(label: "Tasks", value: text("\(model.left)"), unit: "left"),
                               MistMetric(label: "Done", value: text("\(model.done)"), unit: "")])
                .widgetURL(NeedtLink.today)
        }
    }
}

struct MistNext: View {
    @Environment(\.needt) private var c
    var model: NextModel

    var body: some View {
        guard let e = model.event else { return AnyView(EmptyView()) }
        let hhmm = WidgetClock.hhmm(e.start, calendar: c.calendar)
        let live: AnyView = e.start > c.now && !c.isSnapshot
            ? AnyView(Text(timerInterval: c.now...e.start, countsDown: true, showsHours: false).monospacedDigit())
            : AnyView(Text(formatClock(Int(max(0, e.start.timeIntervalSince(c.now))))).monospacedDigit())
        let length = Int(e.end.timeIntervalSince(e.start) / 3600 * 10) // tenths of an hour
        if c.family == .medium {
            return AnyView(MistCard(progress: 0.6, symbol: "calendar", title: "\(e.title)\n\(e.location ?? "")",
                                    metrics: [MistMetric(label: "In", value: live, unit: ""), MistMetric(label: "At", value: text(hhmm), unit: ""),
                                              MistMetric(label: "Length", value: text(length % 10 == 0 ? "\(length / 10)" : String(format: "%.1f", Double(length) / 10)), unit: "h")])
                .widgetURL(NeedtLink.calendar))
        }
        return AnyView(MistCard(progress: 0.6, symbol: "calendar", title: e.title, metrics: [MistMetric(label: "Starts in", value: live, unit: "")], numberSize: 26)
            .widgetURL(NeedtLink.calendar))
    }
}

struct MistFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        guard let f = model.focus else { return AnyView(EmptyView()) }
        let left = AnyView(CountdownText(focus: f, font: .system(size: 26)))
        let symbol = f.isPaused ? "play.fill" : "pause.fill"
        if c.family == .medium {
            return AnyView(MistCard(progress: f.progress(at: c.now), symbol: symbol, title: "Focus\n\(f.title ?? "Focus")",
                                    metrics: [MistMetric(label: "Left", value: left, unit: ""),
                                              MistMetric(label: "Planned", value: text("\(f.plannedMinutes ?? 25)"), unit: "min")])
                .widgetURL(NeedtLink.focus))
        }
        return AnyView(MistCard(progress: f.progress(at: c.now), symbol: symbol, title: f.title ?? "Focus",
                                metrics: [MistMetric(label: "Left", value: left, unit: "")], numberSize: 26)
            .widgetURL(NeedtLink.focus))
    }
}

struct MistHabits: View {
    @Environment(\.needt) private var c
    var model: HabitsModel

    var body: some View {
        let best = model.habits.max { $0.streak < $1.streak } ?? model.habits.first
        if c.family == .medium {
            MistCard(progress: model.total == 0 ? 0 : Double(model.done) / Double(model.total), symbol: "checkmark", title: "Habits\nthis week",
                     metrics: model.habits.prefix(3).map { h in
                MistMetric(label: h.title, value: text(h.streak > 0 ? "\(h.streak)" : (h.doneToday ? "1" : "0")), unit: h.streak > 0 ? "d" : "")
            })
            .widgetURL(NeedtLink.habits)
        } else {
            MistCard(progress: best?.doneToday == true ? 1 : 0, symbol: "checkmark", title: best?.title ?? "Habits",
                     metrics: [MistMetric(label: "Streak", value: text("\(best?.streak ?? 0)"), unit: "days")])
                .widgetURL(NeedtLink.habits)
        }
    }
}

struct MistQuickAdd: View {
    @Environment(\.needt) private var c

    var body: some View {
        Button(intent: OpenQuickAddIntent()) {
            if c.family == .control {
                MistRing(progress: 1, symbol: "plus").frame(maxWidth: .infinity, maxHeight: .infinity).foregroundStyle(.white)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 10) {
                        MistRing(progress: 0, symbol: "plus")
                        Text("Quick\nadd").font(c.fonts.body.font(16, weight: .medium)).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Text("Add a task").font(c.fonts.display.font(23, weight: .bold)).tracking(-0.9)
                    Text("Needt finds the slot").font(c.fonts.display.font(10.5, weight: .medium)).foregroundStyle(.white.opacity(0.65)).padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
    }
}
