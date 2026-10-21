import NeedtKit
import SwiftUI
import WidgetKit

/// B · Pixel: a lit panel with square cells pressed into it, pixel digits and
/// the "n" creature. Cells carry the data (a day as 15 minute cells, a habit as
/// a month of days); live numbers stay system text.
struct PixelStyle: WidgetStyle {
    var id: StyleID { .pixel }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .monospaced), mono: FontSpec(design: .monospaced)) }

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        if ctx.isDark {
            return AnyView(LinearGradient(stops: [.init(color: RGB(0x15141F).mixed(.white, 0.12).color(), location: 0), .init(color: RGB(0x15141F).color(), location: 0.42), .init(color: RGB(0x15141F).color(), location: 1)], startPoint: .top, endPoint: .bottom))
        }
        return AnyView(LinearGradient(colors: [Color(rgb: 0xFBFAF6), Color(rgb: 0xF0EEE6)], startPoint: .top, endPoint: .bottom))
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { AnyView(PixelToday(model: model)) }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { AnyView(PixelNext(model: model)) }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(PixelFocus(model: model)) }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { AnyView(PixelHabits(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { AnyView(PixelQuickAdd()) }
}

struct PixelTheme {
    let dark: Bool
    var ink: Color { dark ? Color(rgb: 0xF3F1FF) : Color(rgb: 0x17162B) }
    var cell: Color { dark ? Color.white.opacity(0.07) : Color(rgb: 0x141228).opacity(0.07) }
    var a2: Color { ink.opacity(0.6) }
    static let violet = RGB(0x8F7DFF)
    static let salmon = RGB(0xF5A89A)
}

enum PixelLevel { case off, f1, f2, f3, now }

/// A grid of square cells (`.grid`).
struct PixelCells: View {
    var cols: Int
    var levels: [PixelLevel]
    var color: RGB
    var theme: PixelTheme
    var gap: CGFloat = 3
    var width: CGFloat? = nil

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: gap), count: cols), spacing: gap) {
            ForEach(Array(levels.enumerated()), id: \.offset) { _, l in
                cellView(l).aspectRatio(1, contentMode: .fit)
            }
        }
        .frame(width: width)
    }

    @ViewBuilder
    private func cellView(_ l: PixelLevel) -> some View {
        switch l {
        case .off:
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(theme.cell)
        case .now:
            RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(theme.ink, lineWidth: 1.5)
        case .f1, .f2, .f3:
            let a: Double = l == .f1 ? 0.45 : (l == .f2 ? 0.75 : 1)
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(color.color(a))
                .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.45), .clear], startPoint: .top, endPoint: .bottom), lineWidth: 0.5))
                .shadow(color: l == .f3 ? color.color(0.5) : .clear, radius: 3)
        }
    }
}

/// The 3 x 5 pixel font (`pdig`).
struct PixelDigits: View {
    static let glyphs: [Character: [Bool]] = {
        let raw: [Character: String] = ["0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
                                        "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001",
                                        "8": "111101111101111", "9": "111101111001111", ":": "000010000010000"]
        return raw.mapValues { $0.map { $0 == "1" } }
    }()

    var text: String
    var cell: CGFloat
    var color: Color
    var off: Color

    private var widths: [CGFloat] { text.map { $0 == ":" ? 1 : 3 } }

    var body: some View {
        let pitch = cell + 1
        let total = widths.reduce(0) { $0 + $1 * pitch } + CGFloat(max(0, text.count - 1)) * 4
        return Canvas { ctx, _ in
            var x: CGFloat = 0
            for ch in text {
                let g = Self.glyphs[ch] ?? Self.glyphs["0"]!
                let w = ch == ":" ? 1 : 3
                for y in 0..<5 {
                    for gx in 0..<3 {
                        if ch == ":" && gx != 1 { continue }
                        let on = g[y * 3 + gx]
                        let r = CGRect(x: x + CGFloat(ch == ":" ? 0 : gx) * pitch, y: CGFloat(y) * pitch, width: cell, height: cell)
                        ctx.fill(Path(roundedRect: r, cornerRadius: 1), with: .color(on ? color : off))
                    }
                }
                x += CGFloat(w) * pitch + 4
            }
        }
        .frame(width: total, height: 5 * pitch)
    }
}

/// The creature: an "n" with a face.
struct PixelMascot: View {
    enum Mood { case happy, sleep, focus }
    var mood: Mood
    var color: RGB = PixelTheme.violet
    var size: CGFloat = 4

    static let body = ["..BBBBBBB..", ".BLLLLLLLB.", "BLLLLLLLLLB", "BBBBBBBBBBB", "BBBBBBBBBBB", "BBBB...BBBB", "BBB.....BBB", "BBB.....BBB", "BB.......BB"]

    var body: some View {
        var g = Self.body.map { Array($0) }
        let eyes: [(Int, Int, Character)]
        switch mood {
        case .sleep: eyes = [(3, 2, "K"), (3, 3, "K"), (3, 7, "K"), (3, 8, "K")]
        case .focus: eyes = [(3, 2, "W"), (3, 3, "K"), (3, 7, "W"), (3, 8, "K"), (2, 2, "K"), (2, 8, "K")]
        case .happy: eyes = [(3, 2, "W"), (3, 3, "K"), (4, 2, "W"), (4, 3, "W"), (3, 7, "W"), (3, 8, "K"), (4, 7, "W"), (4, 8, "W"), (4, 1, "P"), (4, 9, "P")]
        }
        for (y, x, k) in eyes { g[y][x] = k }
        let palette: [Character: Color] = ["B": color.color(), "L": color.mixed(.white, 0.55).color(), "K": Color(rgb: 0x15141F), "W": .white, "P": Color(rgb: 0xFF9FB8)]
        let s = size
        return Canvas { ctx, _ in
            for (y, row) in g.enumerated() {
                for (x, k) in row.enumerated() {
                    guard let col = palette[k] else { continue }
                    ctx.fill(Path(CGRect(x: CGFloat(x) * s, y: CGFloat(y) * s, width: s, height: s)), with: .color(col))
                }
            }
        }
        .frame(width: 11 * s, height: 9 * s)
        .shadow(color: .black.opacity(0.25), radius: 0, y: 3)
    }
}

/// `.pill`: a tinted, lit capsule with bold text.
struct PixelPill: View {
    @Environment(\.needt) private var c
    var symbol: String?
    var title: String
    var color: RGB
    var theme: PixelTheme
    var height: CGFloat = 34

    var body: some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.system(size: 12, weight: .bold)) }
            Text(title).font(c.fonts.t13(.bold)).lineLimit(1)
        }
        .foregroundStyle(theme.ink)
        .frame(maxWidth: .infinity).frame(height: height)
        .lit(theme.dark ? color.mixed(RGB(0x2A2933), 0.74).color() : color.mixed(.white, 0.78).color(), radius: height / 2, rim: theme.dark ? 0.28 : 0.9)
    }
}

private func slot(_ d: Date, calendar: Calendar) -> Int {
    let c = calendar.dateComponents([.hour, .minute], from: d)
    return ((c.hour ?? 0) * 60 + (c.minute ?? 0)) / 15
}

struct PixelToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        let t = PixelTheme(dark: c.isDark)
        if c.family == .medium { medium(t) } else { small(t) }
    }

    private func small(_ t: PixelTheme) -> some View {
        let rows = model.visibleRows(5)
        let firstOpen = rows.firstIndex { !$0.done }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Today").font(c.fonts.t13(.semibold))
                Spacer()
                PixelMascot(mood: .happy, size: 3)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    let col = RGB(hex: r.colorHex, fallback: 0x8F7DFF)
                    HStack(spacing: 6) {
                        PixelCells(cols: 6, levels: (0..<6).map { k in r.done ? .f3 : (i == firstIndexValue(firstOpen) && k < 2 ? .now : .off) },
                                   color: col, theme: t, gap: 2, width: 66)
                        Text(r.title).font(c.fonts.t12(r.done ? .regular : .semibold)).foregroundStyle(r.done ? t.a2 : t.ink)
                            .lineLimit(1).titleSensitive(c.showTitles)
                    }
                }
            }
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.today)
    }

    private func firstIndexValue(_ i: Int?) -> Int { i ?? -1 }

    private func medium(_ t: PixelTheme) -> some View {
        // 52 cells of 15 minutes from 08:00 to 21:00.
        var levels = Array(repeating: PixelLevel.off, count: 52)
        func fill(_ from: Date, _ to: Date, _ l: PixelLevel) {
            let a = max(0, slot(from, calendar: c.calendar) - 32), b = min(51, max(a, slot(to, calendar: c.calendar) - 32 - 1))
            guard a <= 51, b >= 0 else { return }
            for i in a...b { levels[i] = l }
        }
        let start = c.calendar.startOfDay(for: c.now)
        for r in model.rows {
            guard let when = scheduled(r, start) else { continue }
            fill(when, when.addingTimeInterval(TimeInterval((r.minutes ?? 30) * 60)), r.done ? .f3 : .f1)
        }
        if let e = model.nextEvent { fill(e.start, e.end, .f2) }
        let nowSlot = slot(c.now, calendar: c.calendar) - 32
        if nowSlot >= 0 && nowSlot < 52 { levels[nowSlot] = .now }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("\(model.weekday) · \(model.left) left").font(c.fonts.t13(.semibold))
                Spacer()
                Text("08 → 21").font(c.fonts.t12()).foregroundStyle(t.a2)
            }
            Spacer(minLength: 0)
            PixelCells(cols: 26, levels: levels, color: PixelTheme.violet, theme: t, gap: 3)
            HStack {
                PixelMascot(mood: .happy, size: 3)
                Spacer()
                Text("\(model.done) done\(model.nextTask.map { " · next: \($0.title) \($0.time ?? "")" } ?? "")")
                    .font(c.fonts.t12()).foregroundStyle(t.a2).lineLimit(1).titleSensitive(c.showTitles)
            }.padding(.top, 8)
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.today)
    }

    private func scheduled(_ r: TodayRow, _ start: Date) -> Date? {
        guard let time = r.time, time.count == 5 else { return nil }
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return c.calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: start)
    }
}

struct PixelNext: View {
    @Environment(\.needt) private var c
    var model: NextModel

    var body: some View {
        let t = PixelTheme(dark: c.isDark)
        if let e = model.event {
            if c.family == .medium { medium(t, e) } else { small(t, e) }
        }
    }

    private func hhmm(_ d: Date) -> String { WidgetClock.hhmm(d, calendar: c.calendar) }

    private func small(_ t: PixelTheme, _ e: WidgetEvent) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 3) { Text("Next ·"); UntilText(date: e.start) }.font(c.fonts.t12()).foregroundStyle(t.a2)
            Text(e.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
            Spacer(minLength: 0)
            PixelDigits(text: hhmm(e.start), cell: 5, color: PixelTheme.salmon.color(), off: t.cell)
            Text("to \(hhmm(e.end))\(e.location.map { " · \($0)" } ?? "")").font(c.fonts.t12()).foregroundStyle(t.a2).padding(.top, 8).lineLimit(1)
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.calendar)
    }

    private func medium(_ t: PixelTheme, _ e: WidgetEvent) -> some View {
        let nowSlot = slot(c.now, calendar: c.calendar)
        var levels = Array(repeating: PixelLevel.off, count: 30)
        for i in 0..<30 {
            let s = nowSlot - 12 + i
            if i < 12 { levels[i] = .f1 } else if i == 12 { levels[i] = .now }
            if s >= slot(e.start, calendar: c.calendar), s < slot(e.end, calendar: c.calendar) { levels[i] = .f3 }
        }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Next up").font(c.fonts.t13(.semibold))
                Spacer()
                Text(model.clock).font(c.fonts.t12()).foregroundStyle(t.a2)
            }
            Spacer(minLength: 0)
            HStack(alignment: .bottom, spacing: 14) {
                if e.start > c.now, !c.isSnapshot {
                    Text(timerInterval: c.now...e.start, countsDown: true, showsHours: false)
                        .font(.system(size: 30, weight: .heavy, design: .monospaced)).foregroundStyle(PixelTheme.salmon.color()).monospacedDigit()
                } else {
                    Text(formatClock(Int(max(0, e.start.timeIntervalSince(c.now)))))
                        .font(.system(size: 30, weight: .heavy, design: .monospaced)).foregroundStyle(PixelTheme.salmon.color())
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("until").font(c.fonts.t12()).foregroundStyle(t.a2)
                    Text("\(e.title) · \(hhmm(e.start))").font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                    if let a = model.after { Text("then \(a.title) \(hhmm(a.start))").font(c.fonts.t12()).foregroundStyle(t.a2).lineLimit(1).titleSensitive(c.showTitles) }
                }
            }
            PixelCells(cols: 30, levels: levels, color: PixelTheme.salmon, theme: t, gap: 2).padding(.top, 10)
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.calendar)
    }
}

struct PixelFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        let t = PixelTheme(dark: c.isDark)
        if let f = model.focus {
            if c.family == .medium { medium(t, f) } else { small(t, f) }
        }
    }

    private func small(_ t: PixelTheme, _ f: WidgetFocus) -> some View {
        // The 28 border cells of an 8 x 8 grid fill clockwise with progress.
        let filled = Int((28 * f.progress(at: c.now)).rounded())
        var levels = Array(repeating: PixelLevel.off, count: 64)
        for i in 0..<64 {
            let x = i % 8, y = i / 8
            guard x == 0 || y == 0 || x == 7 || y == 7 else { continue }
            let order = y == 0 ? x : (x == 7 ? 7 + y : (y == 7 ? 14 + (7 - x) : 21 + (7 - y)))
            levels[i] = order < filled ? .f3 : .off
        }
        return Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
            VStack(spacing: 8) {
                HStack {
                    Text("Focus").font(c.fonts.t12(.semibold))
                    Spacer()
                    CountdownText(focus: f, font: c.fonts.t12()).foregroundStyle(t.a2)
                }
                ZStack {
                    PixelCells(cols: 8, levels: levels, color: PixelTheme.violet, theme: t, gap: 3, width: 100)
                    PixelMascot(mood: .focus, size: 4)
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(t.ink)
        }
        .buttonStyle(.plain)
    }

    private func medium(_ t: PixelTheme, _ f: WidgetFocus) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Focus · \(f.title ?? "Focus")").font(c.fonts.t12()).foregroundStyle(t.a2).lineLimit(1).titleSensitive(c.showTitles)
            Spacer(minLength: 0)
            HStack(alignment: .bottom, spacing: 12) {
                PixelMascot(mood: .focus, size: 4)
                CountdownText(focus: f, font: .system(size: 34, weight: .heavy, design: .monospaced)).foregroundStyle(t.ink)
            }
            HStack(spacing: 8) {
                Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
                    PixelPill(symbol: f.isPaused ? "play.fill" : "pause.fill", title: f.isPaused ? "Resume" : "Pause", color: PixelTheme.violet, theme: t)
                }.buttonStyle(.plain)
                Button(intent: FinishFocusWidgetIntent(sessionId: f.sessionId)) {
                    PixelPill(symbol: "checkmark", title: "Done", color: RGB(0xA0C35A), theme: t)
                }.buttonStyle(.plain)
            }.padding(.top, 12)
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.focus)
    }
}

struct PixelHabits: View {
    @Environment(\.needt) private var c
    var model: HabitsModel

    var body: some View {
        let t = PixelTheme(dark: c.isDark)
        if c.family == .medium { medium(t) } else { small(t) }
    }

    private func levels(_ h: WidgetHabit, _ n: Int) -> [PixelLevel] {
        let days = h.history.suffix(n)
        let pad = Array(repeating: PixelLevel.off, count: max(0, n - days.count))
        var out = pad + days.map { $0 ? PixelLevel.f3 : PixelLevel.off }
        if let last = out.indices.last, !h.doneToday { out[last] = .now }
        return out
    }

    private func small(_ t: PixelTheme) -> some View {
        let h = model.habits.max { $0.streak < $1.streak } ?? model.habits.first
        let col = RGB(hex: h?.colorHex, fallback: 0x8F7DFF)
        return VStack(alignment: .leading, spacing: 0) {
            if let h {
                HStack(spacing: 6) {
                    Circle().fill(col.color()).frame(width: 8, height: 8)
                    Text(h.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                }
                PixelCells(cols: 9, levels: levels(h, 36), color: col.mixed(.white, 0.2), theme: t, gap: 3).padding(.top, 8)
                Spacer(minLength: 0)
                Button(intent: ToggleHabitIntent(habitId: h.id)) {
                    PixelPill(symbol: "checkmark", title: "× \(h.streak)", color: col, theme: t, height: 30)
                }.buttonStyle(.plain)
            }
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.habits)
    }

    private func medium(_ t: PixelTheme) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Habits").font(c.fonts.t13(.semibold))
                Spacer()
                PixelMascot(mood: c.isDark ? .sleep : .happy, size: 3)
            }
            Spacer(minLength: 0)
            HStack(alignment: .top, spacing: 12) {
                ForEach(model.habits.prefix(3)) { h in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(h.title).font(c.fonts.t12(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                        PixelCells(cols: 7, levels: levels(h, 21), color: RGB(hex: h.colorHex, fallback: 0x8F7DFF), theme: t, gap: 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .foregroundStyle(t.ink)
        .widgetURL(NeedtLink.habits)
    }
}

struct PixelQuickAdd: View {
    @Environment(\.needt) private var c

    var body: some View {
        let t = PixelTheme(dark: c.isDark)
        Button(intent: OpenQuickAddIntent()) {
            if c.family == .control {
                PixelCells(cols: 5, levels: [0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 3, 3, 3, 3, 3, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0].map { ($0 == 3 ? PixelLevel.f3 : PixelLevel.off) },
                           color: PixelTheme.violet, theme: t, gap: 2, width: 40)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 0) {
                    PixelMascot(mood: .happy, size: 5).padding(.top, 6)
                    Spacer(minLength: 0)
                    PixelPill(symbol: "plus", title: "Add a task", color: PixelTheme.violet, theme: t)
                }
                .foregroundStyle(t.ink)
            }
        }
        .buttonStyle(.plain)
    }
}
