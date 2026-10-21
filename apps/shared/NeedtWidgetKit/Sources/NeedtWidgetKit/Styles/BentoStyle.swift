import NeedtKit
import SwiftUI
import WidgetKit

/// C · Bento: solid colour tiles (yellow, salmon, blue, green, purple) with
/// huge numerals. A small widget is one tile; a medium is a tray of tiles.
struct BentoStyle: WidgetStyle {
    var id: StyleID { .bento }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .serif), mono: FontSpec(design: .monospaced)) }

    static let yellow = Color(rgb: 0xF9DF6D), salmon = Color(rgb: 0xF5A89A), blue = Color(rgb: 0xB0C4EF)
    static let green = Color(rgb: 0xA0C35A), purple = Color(rgb: 0xBA81C5), ink = Color(rgb: 0x17162B)

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        if ctx.family == .medium { return AnyView(ctx.isDark ? Color(rgb: 0x121119) : Color(rgb: 0xECEAE2)) }
        switch kind {
        case .today: return AnyView(Self.yellow)
        case .next: return AnyView(Self.salmon)
        case .focus: return AnyView(Self.green)
        case .habits: return AnyView(Self.purple)
        case .quickAdd: return AnyView(Self.blue)
        }
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { AnyView(BentoToday(model: model)) }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { AnyView(BentoNext(model: model)) }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(BentoFocus(model: model)) }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { AnyView(BentoHabits(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { AnyView(BentoQuickAdd()) }
}

/// A coloured tile with its content inset 10 or 12 (`.tile`).
struct BentoTile<Content: View>: View {
    var fill: Color
    var radius: CGFloat = 18
    var inset: CGFloat = 12
    var ink: Color = BentoStyle.ink
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .foregroundStyle(ink)
            .padding(inset)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .lit(fill, radius: radius, rim: 0.5, shadow: .black.opacity(0.14))
    }
}

private struct BentoText {
    let c: RenderContext
    func k(_ s: String) -> Text { Text(s.uppercased()).font(.system(size: 12, weight: .heavy)).tracking(0.5) }
    func huge(_ s: String, _ size: CGFloat = 64) -> Text { Text(s).font(c.fonts.num(size)).tracking(-size * 0.04) }
}

private struct BentoChip: View {
    @Environment(\.needt) private var c
    var dark = true
    var content: AnyView

    var body: some View {
        content.font(.system(size: 12, weight: .bold))
            .foregroundStyle(dark ? Color.white : BentoStyle.ink)
            .padding(.horizontal, 10).frame(height: 26)
            .background(Capsule().fill(dark ? BentoStyle.ink : BentoStyle.ink.opacity(0.12)).shadow(color: .black.opacity(dark ? 0.25 : 0), radius: 2, y: 1))
    }
}

struct BentoToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        let x = BentoText(c: c)
        let tray = c.isDark ? Color(rgb: 0xF3F1FF) : BentoStyle.ink
        let card = c.isDark ? Color(rgb: 0x1D1C27) : Color.white
        if c.family == .medium {
            if c.choices.todayMedium == .tray { alt(x, tray, card) } else { standard(x) }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                x.k("Today")
                Spacer(minLength: 0)
                x.huge("\(model.left)")
                Text("tasks left").font(c.fonts.t13(.semibold))
                HStack(spacing: 4) {
                    ForEach(Array(model.rows.prefix(8).enumerated()), id: \.offset) { _, r in
                        Capsule().fill(r.done ? BentoStyle.ink : BentoStyle.ink.opacity(0.18)).frame(height: 6)
                    }
                }.padding(.top, 8)
            }
            .foregroundStyle(BentoStyle.ink)
            .widgetURL(NeedtLink.today)
        }
    }

    private func standard(_ x: BentoText) -> some View {
        HStack(spacing: 8) {
            BentoTile(fill: BentoStyle.yellow) {
                VStack(alignment: .leading, spacing: 0) {
                    x.k("Today")
                    Spacer(minLength: 0)
                    x.huge("\(model.left)", 56)
                    Text("left · \(model.done) done").font(c.fonts.t12(.semibold))
                }
            }
            .frame(width: 118)
            BentoTile(fill: BentoStyle.salmon) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        x.k("Next")
                        Spacer()
                        if let e = model.nextEvent { BentoChip(content: AnyView(UntilText(date: e.start))) }
                    }
                    Spacer(minLength: 0)
                    if let e = model.nextEvent {
                        Text("\(e.title)\(e.location.map { " · \($0)" } ?? "")").font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                        x.huge(WidgetClock.hhmm(e.start, calendar: c.calendar), 40)
                    } else {
                        Text("No more events").font(c.fonts.t13(.semibold))
                    }
                }
            }
        }
        .padding(-8)
        .widgetURL(NeedtLink.today)
    }

    private func alt(_ x: BentoText, _ tray: Color, _ card: Color) -> some View {
        HStack(spacing: 8) {
            BentoTile(fill: BentoStyle.yellow) {
                VStack(alignment: .leading, spacing: 0) {
                    x.k("Today")
                    Spacer(minLength: 0)
                    x.huge("\(model.left)")
                    Text("left · \(model.done) done").font(c.fonts.t12(.semibold))
                }
            }
            .frame(width: 128)
            BentoTile(fill: card, inset: 10, ink: tray) {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(model.openRows().prefix(4)) { r in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(RGB(hex: r.colorHex, fallback: 0x8F7DFF).color()).frame(width: 10, height: 10)
                            Text(r.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                            Spacer(minLength: 4)
                            Text(r.time ?? "").font(c.fonts.t12()).monospacedDigit().opacity(0.55)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(-8)
        .widgetURL(NeedtLink.today)
    }
}

struct BentoNext: View {
    @Environment(\.needt) private var c
    var model: NextModel

    var body: some View {
        guard let e = model.event else { return AnyView(EmptyView()) }
        return AnyView(content(e))
    }

    private func hhmm(_ d: Date) -> String { WidgetClock.hhmm(d, calendar: c.calendar) }

    @ViewBuilder
    private func content(_ e: WidgetEvent) -> some View {
        let x = BentoText(c: c)
        let card = c.isDark ? Color(rgb: 0x1D1C27) : Color.white
        let tray = c.isDark ? Color(rgb: 0xF3F1FF) : BentoStyle.ink
        if c.family == .medium {
            HStack(spacing: 8) {
                BentoTile(fill: BentoStyle.salmon) {
                    VStack(alignment: .leading, spacing: 0) {
                        x.k("Next\(e.location.map { " · \($0)" } ?? "")")
                        Spacer(minLength: 0)
                        Text(e.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                        x.huge(hhmm(e.start), 46)
                    }
                }
                .frame(width: 200)
                VStack(spacing: 8) {
                    BentoTile(fill: BentoStyle.blue, inset: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            x.k("In")
                            countdown(e).font(c.fonts.num(28))
                        }
                    }
                    BentoTile(fill: card, inset: 10, ink: tray) {
                        VStack(alignment: .leading, spacing: 2) {
                            x.k("Then").opacity(0.55)
                            Text(model.after?.title ?? "Nothing").font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                            Text(model.after.map { hhmm($0.start) } ?? "").font(c.fonts.t12()).opacity(0.6)
                        }
                    }
                }
            }
            .padding(-8)
            .widgetURL(NeedtLink.calendar)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                x.k("Next")
                Spacer(minLength: 0)
                x.huge(hhmm(e.start), 46)
                Text(e.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                BentoChip(content: AnyView(UntilText(date: e.start))).padding(.top, 8)
            }
            .foregroundStyle(BentoStyle.ink)
            .widgetURL(NeedtLink.calendar)
        }
    }

    @ViewBuilder
    private func countdown(_ e: WidgetEvent) -> some View {
        if e.start > c.now, !c.isSnapshot {
            Text(timerInterval: c.now...e.start, countsDown: true, showsHours: false).monospacedDigit()
        } else {
            Text(formatClock(Int(max(0, e.start.timeIntervalSince(c.now))))).monospacedDigit()
        }
    }
}

struct BentoFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        guard let f = model.focus else { return AnyView(EmptyView()) }
        return AnyView(content(f))
    }

    @ViewBuilder
    private func bar(_ f: WidgetFocus) -> some View {
        if c.isSnapshot || f.isPaused || f.interval == nil {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(BentoStyle.ink.opacity(0.18))
                    Capsule().fill(BentoStyle.ink).frame(width: geo.size.width * f.progress(at: c.now))
                }
            }.frame(height: 6)
        } else if let i = f.interval {
            ProgressView(timerInterval: i, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear).tint(BentoStyle.ink).frame(height: 6)
        }
    }

    @ViewBuilder
    private func content(_ f: WidgetFocus) -> some View {
        let x = BentoText(c: c)
        let card = c.isDark ? Color(rgb: 0x1D1C27) : Color.white
        let tray = c.isDark ? Color(rgb: 0xF3F1FF) : BentoStyle.ink
        if c.family == .medium {
            HStack(spacing: 8) {
                BentoTile(fill: BentoStyle.green) {
                    VStack(alignment: .leading, spacing: 0) {
                        x.k("Focus")
                        Spacer(minLength: 0)
                        CountdownText(focus: f, font: c.fonts.num(44)).minimumScaleFactor(0.6).lineLimit(1)
                        Text("left of \(f.plannedMinutes ?? 25)").font(c.fonts.t12(.semibold))
                    }
                }
                .frame(width: 150)
                BentoTile(fill: card, ink: tray) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(f.isPaused ? "Paused" : "Now").font(c.fonts.t12()).opacity(0.55)
                        Text(f.title ?? "Focus").font(c.fonts.t13(.semibold)).lineLimit(2).titleSensitive(c.showTitles)
                        Spacer(minLength: 0)
                        HStack(spacing: 10) {
                            Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
                                Image(systemName: f.isPaused ? "play.fill" : "pause.fill").font(.system(size: 14, weight: .bold))
                                    .frame(width: 40, height: 40).overlay(Circle().strokeBorder(tray, lineWidth: 2))
                            }.buttonStyle(.plain)
                            Button(intent: FinishFocusWidgetIntent(sessionId: f.sessionId)) {
                                Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                                    .frame(width: 40, height: 40).background(Circle().fill(BentoStyle.ink))
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(-8)
            .widgetURL(NeedtLink.focus)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                x.k("Focus")
                Spacer(minLength: 0)
                CountdownText(focus: f, font: c.fonts.num(48)).minimumScaleFactor(0.6).lineLimit(1)
                Text("left · \(f.title ?? "Focus")").font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                bar(f).padding(.top, 8)
            }
            .foregroundStyle(BentoStyle.ink)
            .widgetURL(NeedtLink.focus)
        }
    }
}

struct BentoHabits: View {
    @Environment(\.needt) private var c
    var model: HabitsModel

    var body: some View {
        let x = BentoText(c: c)
        let best = model.habits.max { $0.streak < $1.streak } ?? model.habits.first
        if c.family == .medium {
            HStack(spacing: 6) {
                ForEach(Array(model.habits.prefix(3).enumerated()), id: \.element.id) { i, h in
                    BentoTile(fill: [BentoStyle.purple, BentoStyle.green, BentoStyle.yellow][i % 3], inset: 10) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(h.title).font(c.fonts.t12(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                            Spacer(minLength: 0)
                            x.huge("\(h.streak)", 38)
                            Button(intent: ToggleHabitIntent(habitId: h.id)) {
                                HStack(spacing: 4) {
                                    Image(systemName: h.doneToday ? "checkmark" : "circle").font(.system(size: 10, weight: .bold))
                                    Text(h.doneToday ? "today" : "1 to go").font(c.fonts.t12(.semibold))
                                }
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(-8)
            .widgetURL(NeedtLink.habits)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                x.k(best?.title ?? "Habits").lineLimit(1)
                Spacer(minLength: 0)
                x.huge("\(best?.streak ?? 0)")
                Text("days in a row").font(c.fonts.t13(.semibold))
            }
            .foregroundStyle(BentoStyle.ink)
            .widgetURL(NeedtLink.habits)
        }
    }
}

struct BentoQuickAdd: View {
    @Environment(\.needt) private var c

    var body: some View {
        let x = BentoText(c: c)
        Button(intent: OpenQuickAddIntent()) {
            if c.family == .control {
                Image(systemName: "plus").font(.system(size: 20, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 46, height: 46).background(Circle().fill(BentoStyle.ink).shadow(color: .black.opacity(0.3), radius: 3, y: 2))
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(BentoStyle.blue)
            } else {
                ZStack(alignment: .topTrailing) {
                    VStack(alignment: .leading, spacing: 0) {
                        x.k("New task")
                        Spacer(minLength: 0)
                        Text("Add").font(c.fonts.num(46)).tracking(-1.4)
                        Text("Needt finds a slot").font(c.fonts.t12(.semibold)).opacity(0.6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "plus").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 44, height: 44).background(Circle().fill(BentoStyle.ink))
                }
                .foregroundStyle(BentoStyle.ink)
            }
        }
        .buttonStyle(.plain)
    }
}
