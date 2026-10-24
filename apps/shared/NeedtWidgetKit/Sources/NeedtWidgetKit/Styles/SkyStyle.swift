import NeedtKit
import SwiftUI
import WidgetKit

/// A · Sky: a sky that follows the day (blue by day, lavender for focus,
/// amber evening for the next event, stars at night), a sun on an arc, frosted
/// glass. Numerals in SF Pro Rounded Bold.
struct SkyStyle: WidgetStyle {
    var id: StyleID { .sky }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .rounded), mono: FontSpec(design: .monospaced)) }

    enum Sky { case day, lav, eve, night }

    static func sky(_ kind: NeedtWidgetKind, dark: Bool) -> Sky {
        if dark { return .night }
        switch kind {
        case .focus: return .lav
        case .next: return .eve
        default: return .day
        }
    }

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        let s = Self.sky(kind, dark: ctx.isDark)
        switch s {
        case .day:
            return AnyView(LinearGradient(stops: [.init(color: Color(rgb: 0x5EA9F6), location: 0), .init(color: Color(rgb: 0x8CC4FB), location: 0.55), .init(color: Color(rgb: 0xCFE6FF), location: 1)], startPoint: .top, endPoint: .bottom))
        case .lav:
            return AnyView(LinearGradient(stops: [.init(color: Color(rgb: 0xA9B1DB), location: 0), .init(color: Color(rgb: 0xC7C9E6), location: 0.6), .init(color: Color(rgb: 0xECE6EA), location: 1)], startPoint: .top, endPoint: .bottom))
        case .eve:
            return AnyView(LinearGradient(stops: [.init(color: Color(rgb: 0x6F6A96), location: 0), .init(color: Color(rgb: 0xB98A8A), location: 0.48), .init(color: Color(rgb: 0xF6A55A), location: 1)], startPoint: .top, endPoint: .bottom))
        case .night:
            return AnyView(RadialGradient(colors: [Color(rgb: 0x23214A), Color(rgb: 0x0B0B18)], center: UnitPoint(x: 0.3, y: 0), startRadius: 0, endRadius: 190)
                .background(Color(rgb: 0x0B0B18)))
        }
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { AnyView(SkyToday(model: model)) }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { AnyView(SkyNext(model: model)) }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(SkyFocus(model: model)) }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { AnyView(SkyHabits(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { AnyView(SkyQuickAdd()) }
}

/// Colours and glass for one sky.
struct SkyTheme {
    let sky: SkyStyle.Sky
    var night: Bool { sky == .night }
    var ink: Color {
        switch sky {
        case .day: return Color(rgb: 0x10213F)
        case .lav: return Color(rgb: 0x1B1A36)
        case .eve, .night: return .white
        }
    }
    var a2: Color { ink.opacity(0.72) }
    var a3: Color { ink.opacity(0.5) }
    var glassFill: Color { Color.white.opacity(sky == .day || sky == .lav ? 0.28 : 0.12) }
    var glassRim: Double { sky == .day || sky == .lav ? 0.75 : 0.3 }
    var checkFill: Color {
        switch sky {
        case .day: return Color(rgb: 0x9CC8F8)
        case .lav: return Color(rgb: 0xC7C9E6)
        case .eve: return Color(rgb: 0x6F6A96)
        case .night: return Color(rgb: 0x1E1C3F)
        }
    }
    var sun: SunOrb.Kind { night ? .moon : (sky == .eve ? .eve : .day) }
}

/// Soft clouds by day, a handful of stars at night.
struct SkyClouds: View {
    var size: CGSize
    var night: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            if night {
                ForEach(Array([(0.20, 0.30, 1.0, 1.0), (0.70, 0.20, 1.0, 1.0), (0.45, 0.12, 1.5, 1.0), (0.85, 0.45, 1.0, 0.7), (0.12, 0.60, 1.0, 0.6)].enumerated()), id: \.offset) { _, s in
                    Circle().fill(Color.white.opacity(s.3)).frame(width: s.2 * 1.6, height: s.2 * 1.6)
                        .position(x: size.width * s.0, y: size.height * s.1)
                }
            } else {
                cloud(w: 120, h: 32, x: 0.22, y: 0.30, a: 0.55)
                cloud(w: 180, h: 40, x: 0.78, y: 0.22, a: 0.40)
                cloud(w: 260, h: 60, x: 0.60, y: 1.08, a: 0.70)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .clipped()
    }

    private func cloud(w: CGFloat, h: CGFloat, x: CGFloat, y: CGFloat, a: Double) -> some View {
        Circle()
            .fill(RadialGradient(colors: [.white.opacity(a), .white.opacity(0)], center: .center, startRadius: 0, endRadius: w / 2))
            .frame(width: w, height: w)
            .scaleEffect(x: 1, y: h / w)
            .position(x: size.width * x, y: size.height * y)
    }
}

private func big(_ size: CGFloat) -> Font { .system(size: size, weight: .bold, design: .rounded) }

struct SkyToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        let t = SkyTheme(sky: SkyStyle.sky(.today, dark: c.isDark))
        if c.family == .medium { medium(t) } else { small(t) }
    }

    private func small(_ t: SkyTheme) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                // Lab A1 lands the sun on the Next glass; the default arc height with the sun a little later in the day
                // puts it to the right of the number, clear of both the text and the glass.
                SkyArc(p: 0.62, size: size, l: 0.14, b: 0.62, night: t.night, sun: t.sun)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text(model.weekday).font(c.fonts.t13(.semibold)).foregroundStyle(t.ink)
                        Spacer()
                        Text(model.clock).font(c.fonts.t12()).foregroundStyle(t.a2)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text("\(model.left)").font(big(40)).tracking(-1.2)
                        Text(" left").font(c.fonts.t13(.semibold))
                    }
                    .foregroundStyle(t.ink).padding(.top, 6)
                    Spacer(minLength: 0)
                    if let n = model.nextTask {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Next · \(n.time ?? "today")").font(c.fonts.t12()).foregroundStyle(t.a2)
                            Text(n.title).font(c.fonts.t13(.semibold)).foregroundStyle(t.ink).lineLimit(1).titleSensitive(c.showTitles)
                        }
                        .padding(.horizontal, 9).padding(.vertical, 7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .lit(t.glassFill, radius: 14, rim: t.glassRim)
                    }
                }
                .pad(size)
            }
        }
        .widgetURL(NeedtLink.today)
    }

    private func medium(_ t: SkyTheme) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                // Lab A2 puts the sun at y 96, on top of the "left" label; the arc sits 0.22 lower so it clears the text.
                SkyArc(p: 0.45, size: CGSize(width: 150, height: size.height), l: 0.3, b: 1.32, night: t.night, sun: t.sun)
                    .frame(width: 150, height: size.height).clipped()
                VStack(alignment: .leading, spacing: 0) {
                    Text(model.weekday).font(c.fonts.t13(.semibold))
                    Text(model.dateLabel).font(c.fonts.t12()).foregroundStyle(t.a2)
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text("\(model.left)").font(big(40)).tracking(-1.2)
                        Text(" left").font(c.fonts.t13(.semibold))
                    }.padding(.top, 8)
                    Text("\(model.done) done").font(c.fonts.t12()).foregroundStyle(t.a2)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(t.ink)
                .frame(width: 104, alignment: .leading)
                .padding(16)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(model.visibleRows(4)) { r in
                        StyledCheck(title: r.title, done: r.done, taskId: r.id, font: c.fonts.t13(r.done ? .regular : .semibold),
                                    color: r.done ? t.a3 : t.ink, strike: true, trailing: r.time, trailingColor: t.a2) { on in
                            RoundCheck(on: on, color: t.ink, fill: t.checkFill)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(width: 190, height: size.height - 20, alignment: .topLeading)
                .lit(t.glassFill, radius: 20, rim: t.glassRim)
                .offset(x: size.width - 10 - 190, y: 10)
            }
        }
        .widgetURL(NeedtLink.today)
    }
}

struct SkyNext: View {
    @Environment(\.needt) private var c
    var model: NextModel

    var body: some View {
        let t = SkyTheme(sky: SkyStyle.sky(.next, dark: c.isDark))
        if let e = model.event {
            if c.family == .medium { medium(t, e) } else { small(t, e) }
        }
    }

    private func hhmm(_ d: Date) -> String { WidgetClock.hhmm(d, calendar: c.calendar) }

    private func small(_ t: SkyTheme, _ e: WidgetEvent) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                SkyArc(p: 0.78, size: size, night: t.night, sun: t.sun)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 3) { Text("Next ·"); UntilText(date: e.start) }
                        .font(c.fonts.t12()).foregroundStyle(t.a2)
                    Text(e.title).font(c.fonts.t13(.semibold)).padding(.top, 2).lineLimit(1).titleSensitive(c.showTitles)
                    Text(hhmm(e.start)).font(big(34)).tracking(-1).monospacedDigit().padding(.top, 8)
                    Text("until \(hhmm(e.end))\(e.location.map { " · \($0)" } ?? "")").font(c.fonts.t12()).foregroundStyle(t.a2).lineLimit(1)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(t.ink)
                .pad(size)
            }
        }
        .widgetURL(NeedtLink.calendar)
    }

    private func medium(_ t: SkyTheme, _ e: WidgetEvent) -> some View {
        let start = c.calendar.dateInterval(of: .hour, for: c.now.addingTimeInterval(-3600))?.start ?? c.now
        func frac(_ d: Date) -> CGFloat { CGFloat(min(1, max(0, d.timeIntervalSince(start) / (5 * 3600)))) }
        return FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("This afternoon").font(c.fonts.t13(.semibold))
                        Spacer()
                        Text(model.clock).font(c.fonts.t12()).foregroundStyle(t.a2)
                    }
                    Spacer(minLength: 0)
                    GeometryReader { geo in
                        let w = geo.size.width
                        ZStack(alignment: .topLeading) {
                            ForEach(0..<6, id: \.self) { i in
                                Text(hhmm(start.addingTimeInterval(Double(i) * 3600))).font(c.fonts.t12()).foregroundStyle(t.a3).monospacedDigit()
                                    .position(x: CGFloat(i) * (w - 30) / 5 + 15, y: geo.size.height - 6)
                            }
                            block(e.title, t, minWidth: max(w * 0.2, (frac(e.end) - frac(e.start)) * w)).offset(x: frac(e.start) * w)
                            if let a = model.after {
                                block("\(a.title) \(hhmm(a.start))", t).opacity(0.85).fixedSize()
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                            }
                            SunOrb(kind: t.sun, size: 12).position(x: frac(c.now) * w, y: 15)
                            Path { p in p.move(to: CGPoint(x: frac(c.now) * w, y: 15)); p.addLine(to: CGPoint(x: frac(c.now) * w, y: geo.size.height - 18)) }
                                .stroke(Color.white.opacity(0.6), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                        }
                    }
                    .frame(height: 56)
                }
                .foregroundStyle(t.ink)
                .pad(size)
            }
        }
        .widgetURL(NeedtLink.calendar)
    }

    private func block(_ title: String, _ t: SkyTheme, minWidth: CGFloat = 0) -> some View {
        Text(title).font(c.fonts.t12(.semibold)).foregroundStyle(t.ink).lineLimit(1).fixedSize().titleSensitive(c.showTitles)
            .padding(.horizontal, 8).frame(minWidth: minWidth, minHeight: 30, maxHeight: 30, alignment: .leading)
            .lit(t.glassFill, radius: 9, rim: t.glassRim)
    }
}

struct SkyFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        let t = SkyTheme(sky: SkyStyle.sky(.focus, dark: c.isDark))
        if let f = model.focus {
            if c.family == .medium { medium(t, f) } else { small(t, f) }
        }
    }

    private func small(_ t: SkyTheme, _ f: WidgetFocus) -> some View {
        FullBleed { size in
            ZStack {
                SkyClouds(size: size, night: t.night)
                Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
                    ZStack {
                        FocusRing(focus: f, diameter: 106, lineWidth: 7, tint: c.isDark ? Color.white.opacity(0.9) : .white,
                                  track: c.isDark ? Color.white.opacity(0.1) : Color.white.opacity(0.35))
                        VStack(spacing: 0) {
                            CountdownText(focus: f, font: big(30)).tracking(-0.9).foregroundStyle(t.ink)
                            Text(f.isPaused ? "paused" : "left").font(c.fonts.t12()).foregroundStyle(t.a2)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func medium(_ t: SkyTheme, _ f: WidgetFocus) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                // Lab A6 runs the arc through the title; 0.25 lower it passes between the title and the time.
                SkyArc(p: f.progress(at: c.now), size: size, l: 0.06, b: 1.75, night: t.night, sun: t.sun)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Focus").font(c.fonts.t12()).foregroundStyle(t.a2)
                    Text(f.title ?? "Focus").font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                    Spacer(minLength: 0)
                    HStack(alignment: .bottom) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            CountdownText(focus: f, font: big(36)).tracking(-1)
                            Text("left").font(c.fonts.t13(.semibold))
                        }
                        Spacer(minLength: 6)
                        HStack(spacing: 8) {
                            Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
                                glassButton(f.isPaused ? "play.fill" : "pause.fill", f.isPaused ? "Resume" : "Pause", t)
                            }.buttonStyle(.plain)
                            Button(intent: FinishFocusWidgetIntent(sessionId: f.sessionId)) { glassButton("checkmark", "Done", t) }.buttonStyle(.plain)
                        }
                    }
                }
                .foregroundStyle(t.ink)
                .pad(size)
            }
        }
        .widgetURL(NeedtLink.focus)
    }

    private func glassButton(_ symbol: String, _ title: String, _ t: SkyTheme) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 12, weight: .bold))
            Text(title).font(c.fonts.t13(.semibold)).fixedSize()
        }
        .foregroundStyle(t.ink).padding(.horizontal, 14).frame(height: 34)
        .lit(t.glassFill, radius: 17, rim: t.glassRim)
    }
}

struct SkyHabits: View {
    @Environment(\.needt) private var c
    var model: HabitsModel

    var body: some View {
        let t = SkyTheme(sky: SkyStyle.sky(.habits, dark: c.isDark))
        if c.family == .medium { medium(t) } else { small(t) }
    }

    private func small(_ t: SkyTheme) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("Habits").font(c.fonts.t13(.semibold))
                        Spacer()
                        Text("\(model.done) of \(model.total)").font(c.fonts.t12()).foregroundStyle(t.a2)
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(model.habits.prefix(3)) { h in
                            StyledCheck(title: h.title, done: h.doneToday, habitId: h.id, font: c.fonts.t13(.semibold), color: t.ink,
                                        trailing: h.streak > 0 ? "\(h.streak)d" : nil, trailingColor: t.a2) { on in
                                RoundCheck(on: on, color: t.ink, fill: t.checkFill)
                            }
                        }
                    }
                }
                .foregroundStyle(t.ink)
                .pad(size)
            }
        }
        .widgetURL(NeedtLink.habits)
    }

    private func medium(_ t: SkyTheme) -> some View {
        let best = model.habits.max { $0.streak < $1.streak } ?? model.habits.first
        let days = best?.last7 ?? []
        let padded = Array(repeating: false, count: max(0, 7 - days.count)) + days
        let letters: [String] = (0..<7).map { i in
            let d = c.calendar.date(byAdding: .day, value: i - 6, to: c.now) ?? c.now
            return String(WidgetCalendar.formatter("EEEEE", calendar: c.calendar).string(from: d).prefix(1))
        }
        return FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("This week").font(c.fonts.t13(.semibold))
                        Spacer()
                        Text(best.map { "\($0.title) · \($0.streak) days" } ?? "").font(c.fonts.t12()).foregroundStyle(t.a2).lineLimit(1).titleSensitive(c.showTitles)
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        ForEach(0..<7, id: \.self) { i in
                            VStack(spacing: 3) {
                                ZStack {
                                    if padded[i] {
                                        SunOrb(kind: t.sun, size: 14)
                                            .background(Circle().stroke(Color.white.opacity(i == 6 ? 0.5 : 0), lineWidth: 3).frame(width: 20, height: 20))
                                    } else {
                                        Circle().fill(t.ink.opacity(0.25)).frame(width: 8, height: 8)
                                    }
                                }
                                .frame(maxWidth: .infinity).frame(height: 46)
                                .lit(t.glassFill, radius: 12, rim: t.glassRim)
                                Text(letters[i]).font(c.fonts.t12()).foregroundStyle(t.a2)
                            }
                        }
                    }
                }
                .foregroundStyle(t.ink)
                .pad(size)
            }
        }
        .widgetURL(NeedtLink.habits)
    }
}

struct SkyQuickAdd: View {
    @Environment(\.needt) private var c

    var body: some View {
        let t = SkyTheme(sky: SkyStyle.sky(.quickAdd, dark: c.isDark))
        Button(intent: OpenQuickAddIntent()) {
            if c.family == .control { control(t) } else { small(t) }
        }
        .buttonStyle(.plain)
    }

    private func control(_ t: SkyTheme) -> some View {
        FullBleed(margin: 0) { size in
            ZStack {
                SkyClouds(size: size, night: t.night)
                Image(systemName: "plus").font(.system(size: 22, weight: .semibold)).foregroundStyle(t.ink)
                    .frame(width: 52, height: 52).lit(t.glassFill, radius: 26, rim: t.glassRim)
            }
        }
    }

    private func small(_ t: SkyTheme) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                SkyClouds(size: size, night: t.night)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Add a task").font(c.fonts.t13(.semibold))
                    Text("Needt finds the time").font(c.fonts.t12()).foregroundStyle(t.a2)
                    Spacer(minLength: 0)
                    HStack {
                        Text("Say it…").font(c.fonts.t13()).foregroundStyle(t.a2)
                        Spacer()
                        Image(systemName: "mic").font(.system(size: 13))
                    }
                    .padding(.horizontal, 10).frame(height: 38)
                    .lit(t.glassFill, radius: 19, rim: t.glassRim)
                    HStack(spacing: 5) {
                        ForEach(["Today", "30 min"], id: \.self) { s in
                            Text(s).font(c.fonts.t12()).padding(.horizontal, 8).padding(.vertical, 3).lit(t.glassFill, radius: 9, rim: t.glassRim)
                        }
                    }.padding(.top, 8)
                }
                .foregroundStyle(t.ink)
                .pad(size)
            }
        }
    }
}
