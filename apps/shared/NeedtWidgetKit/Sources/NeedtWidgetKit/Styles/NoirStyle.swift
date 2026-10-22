import NeedtKit
import SwiftUI
import WidgetKit

/// F · Noir: black, warm graphite and brown tiles, butter-yellow marks, dot
/// matrices and dark frosted glass. A dark style: it looks the same in both
/// themes. Type: Bricolage Grotesque, Doto (dot-matrix digits), Sometype Mono.
struct NoirStyle: WidgetStyle {
    var id: StyleID { .noir }
    var fonts: StyleFonts {
        StyleFonts(body: FontSpec(name: "Bricolage Grotesque"), display: FontSpec(name: "Doto", design: .monospaced),
                   mono: FontSpec(name: "Sometype Mono", design: .monospaced))
    }

    static let cream = Color(rgb: 0xF3ECE4), yellow = Color(rgb: 0xE9D46C)

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        switch (kind, ctx.family) {
        case (.next, _), (.habits, .small):
            return AnyView(LinearGradient(colors: [Color(rgb: 0x6A5652), Color(rgb: 0x4D3F3C)], startPoint: .topLeading, endPoint: .bottomTrailing))
        case (.focus, .medium):
            return AnyView(ZStack {
                Color(rgb: 0x262523)
                LinearGradient(colors: [Color(rgb: 0x78766F).opacity(0.55), Color(rgb: 0x3C3A37).opacity(0.75)], startPoint: .top, endPoint: .bottom)
            })
        case (.quickAdd, .control):
            return AnyView(LinearGradient(colors: [Color(rgb: 0xF4F1E6), Color(rgb: 0xD8D3C2)], startPoint: .topLeading, endPoint: .bottomTrailing))
        default:
            return AnyView(LinearGradient(colors: [Color(rgb: 0x1E1D1C), Color(rgb: 0x121212)], startPoint: .top, endPoint: .bottom))
        }
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { AnyView(NoirToday(model: model)) }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { AnyView(NoirNext(model: model)) }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(NoirFocus(model: model)) }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { AnyView(NoirHabits(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { AnyView(NoirQuickAdd()) }
}

enum DotKind { case well, dim, yellow, today }

/// `.dm`: a matrix of round dots, wells that light up in butter yellow.
struct DotMatrix: View {
    var cols: Int
    var dots: [DotKind]
    var gap: CGFloat = 5

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: gap), count: cols), spacing: gap) {
            ForEach(Array(dots.enumerated()), id: \.offset) { _, d in
                dot(d).aspectRatio(1, contentMode: .fit)
            }
        }
    }

    @ViewBuilder
    private func dot(_ d: DotKind) -> some View {
        switch d {
        case .well: Circle().fill(Color(rgb: 0x0D0C0C)).overlay(Circle().stroke(Color.black.opacity(0.4), lineWidth: 0.5))
        case .dim: Circle().fill(Color.black.opacity(0.25))
        case .yellow: Circle().fill(NoirStyle.yellow).shadow(color: NoirStyle.yellow.opacity(0.5), radius: 3)
        case .today:
            Circle().fill(NoirStyle.yellow).shadow(color: NoirStyle.yellow.opacity(0.7), radius: 4)
                .overlay(Circle().stroke(NoirStyle.cream, lineWidth: 2).padding(-2))
        }
    }
}

private struct NoirCap: View {
    @Environment(\.needt) private var c
    var text: String
    var color: Color = NoirStyle.cream.opacity(0.55)

    var body: some View {
        Text(text).font(c.fonts.mono.font(10.5, weight: .medium)).tracking(0.7).foregroundStyle(color).lineLimit(1)
    }
}

private struct NoirSun: View {
    var body: some View {
        Circle().fill(RadialGradient(colors: [Color(rgb: 0xFFF4B8), NoirStyle.yellow], center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0, endRadius: 12))
            .frame(width: 18, height: 18)
            .background(Circle().fill(NoirStyle.yellow.opacity(0.18)).frame(width: 26, height: 26))
            .background(Circle().fill(NoirStyle.yellow.opacity(0.08)).frame(width: 34, height: 34))
            .shadow(color: NoirStyle.yellow.opacity(0.6), radius: 8)
            .frame(width: 34, height: 34)
    }
}

private func noirNum(_ c: RenderContext, _ size: CGFloat) -> Font { c.fonts.display.font(size, weight: .black) }

struct NoirToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        if c.family == .medium { medium } else { small }
    }

    private func header(_ size: CGFloat = 25) -> some View {
        HStack(alignment: .top, spacing: 3) {
            Text("Today").font(c.fonts.body.font(size, weight: .bold)).tracking(-size * 0.035)
            Text("\(model.left)").font(.system(size: 11)).opacity(0.7)
        }
        .foregroundStyle(NoirStyle.cream)
    }

    @ViewBuilder
    private func row(_ r: TodayRow, on: Bool, opacity: Double, time: Bool) -> some View {
        let body = rowBody(r, on: on, opacity: opacity, time: time)
        if time && !c.isSnapshot {
            Toggle(isOn: r.done, intent: ToggleTaskIntent(taskId: r.id)) { body }.toggleStyle(LabelOnlyToggleStyle())
        } else {
            body
        }
    }

    private func rowBody(_ r: TodayRow, on: Bool, opacity: Double, time: Bool) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                Text(r.title).font(c.fonts.body.font(13, weight: .semibold)).lineLimit(1).titleSensitive(c.showTitles)
                if time, let t = r.time { Text(t).font(c.fonts.t12()).opacity(0.5).monospacedDigit() }
            }
            Spacer(minLength: 4)
            ZStack {
                Circle().fill(on || r.done ? NoirStyle.yellow : Color.white.opacity(0.12))
                    .overlay(Circle().strokeBorder(Color.white.opacity(on || r.done ? 0 : 0.2), lineWidth: 1))
                    .shadow(color: (on || r.done) ? NoirStyle.yellow.opacity(0.45) : .clear, radius: 4)
                if on || r.done { Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(Color(rgb: 0x2A2510)) }
            }
            .frame(width: 16, height: 16)
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(on ? 0.14 : 0.06))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(on ? 0.2 : 0.08), lineWidth: 0.5)))
        .opacity(opacity)
    }

    private func list(_ n: Int, time: Bool) -> some View {
        let rows = model.visibleRows(n)
        let firstOpen = rows.firstIndex { !$0.done }
        return VStack(spacing: 5) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                row(r, on: i == firstOpen, opacity: 1 - Double(i) * (time ? 0.3 : 0.28), time: time)
            }
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            header()
            list(3, time: false).padding(.top, 10)
            Spacer(minLength: 0)
        }
        .widgetURL(NeedtLink.today)
    }

    private var medium: some View {
        let total = model.left + model.done
        return FullBleed { size in
            ZStack(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 0) {
                    header()
                    list(3, time: true).padding(.top, 10)
                    Spacer(minLength: 0)
                }
                .padding(16).padding(.trailing, 134)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("\(model.done)/\(total)").font(noirNum(c, 30))
                        Spacer(minLength: 0)
                        NoirCap(text: "DONE")
                    }
                    DotMatrix(cols: 6, dots: (0..<18).map { i in i < 6 ? (i < model.done ? .yellow : .well) : (i < 12 ? .well : .dim) })
                    Spacer(minLength: 0)
                }
                .foregroundStyle(NoirStyle.cream)
                .padding(12)
                .frame(width: 132, height: size.height - 20, alignment: .topLeading)
                .lit(Color(rgb: 0x5A4A46), radius: 18, rim: 0.18, shadow: .black.opacity(0.5))
                .offset(x: size.width - 10 - 132, y: 10)
            }
        }
        .widgetURL(NeedtLink.today)
    }
}

struct NoirNext: View {
    @Environment(\.needt) private var c
    var model: NextModel

    var body: some View {
        guard let e = model.event else { return AnyView(EmptyView()) }
        return AnyView(content(e))
    }

    private func hhmm(_ d: Date) -> String { WidgetClock.hhmm(d, calendar: c.calendar) }

    @ViewBuilder
    private func content(_ e: WidgetEvent) -> some View {
        if c.family == .medium { month(e) } else { small(e) }
    }

    private func small(_ e: WidgetEvent) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(hhmm(e.start)).font(noirNum(c, 34)).monospacedDigit()
                Spacer()
                HStack(spacing: 4) { NoirCap(text: "IN"); UntilText(date: e.start).font(c.fonts.mono.font(10.5, weight: .medium)).textCase(.uppercase).foregroundStyle(NoirStyle.cream.opacity(0.55)) }
            }
            Spacer(minLength: 0)
            Text(e.title).font(c.fonts.body.font(13, weight: .semibold)).lineLimit(1).titleSensitive(c.showTitles)
            Text("\(e.location.map { "\($0) · " } ?? "")until \(hhmm(e.end))").font(c.fonts.t12()).foregroundStyle(NoirStyle.cream.opacity(0.55)).lineLimit(1)
            Text("Open").font(c.fonts.mono.font(12, weight: .semibold)).tracking(0.5).foregroundStyle(Color(rgb: 0x2A2510))
                .padding(.horizontal, 14).frame(height: 26)
                .background(Capsule().fill(NoirStyle.yellow).shadow(color: NoirStyle.yellow.opacity(0.5), radius: 5, y: 3))
                .padding(.top, 8)
        }
        .foregroundStyle(NoirStyle.cream)
        .widgetURL(NeedtLink.calendar)
    }

    private func month(_ e: WidgetEvent) -> some View {
        let cal = c.calendar
        let first = cal.dateInterval(of: .month, for: c.now)?.start ?? c.now
        let days = cal.range(of: .day, in: .month, for: c.now)?.count ?? 30
        let lead = (cal.component(.weekday, from: first) + 5) % 7       // Monday first
        let today = cal.component(.day, from: c.now)
        var eventDays = Set<Int>()
        eventDays.insert(cal.component(.day, from: e.start))
        if let a = model.after { eventDays.insert(cal.component(.day, from: a.start)) }
        let dots: [DotKind] = (0..<35).map { i in
            let day = i - lead + 1
            if day < 1 || day > days { return .dim }
            if day == today { return .today }
            return eventDays.contains(day) ? .yellow : .well
        }
        return FullBleed { size in
            ZStack(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(today)").font(noirNum(c, 44))
                    NoirCap(text: "\(WidgetCalendar.formatter("MMM", calendar: cal).string(from: c.now).uppercased()) · \(model.weekdayLabel(c).uppercased())")
                    Spacer(minLength: 0)
                    Text("\(e.title) · \(hhmm(e.start))").font(c.fonts.body.font(13, weight: .semibold)).lineLimit(1).titleSensitive(c.showTitles)
                    if let a = model.after {
                        Text("then \(a.title) \(hhmm(a.start))").font(c.fonts.t12()).foregroundStyle(NoirStyle.cream.opacity(0.5)).lineLimit(1).titleSensitive(c.showTitles)
                    }
                }
                .foregroundStyle(NoirStyle.cream)
                .padding(16).padding(.trailing, 170)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                DotMatrix(cols: 7, dots: dots).frame(width: 150).offset(x: size.width - 16 - 150, y: 18)
            }
        }
        .widgetURL(NeedtLink.calendar)
    }
}

private extension NextModel {
    func weekdayLabel(_ c: RenderContext) -> String { WidgetCalendar.formatter("EEEE", calendar: c.calendar).string(from: c.now) }
}

struct NoirFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        guard let f = model.focus else { return AnyView(EmptyView()) }
        return AnyView(c.family == .medium ? AnyView(medium(f)) : AnyView(small(f)))
    }

    private func small(_ f: WidgetFocus) -> some View {
        Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
            VStack(alignment: .leading, spacing: 0) {
                HStack { NoirSun(); Spacer(); NoirCap(text: f.isPaused ? "PAUSED" : "FOCUS") }
                Spacer(minLength: 0)
                CountdownText(focus: f, font: c.fonts.display.font(44, weight: .black)).foregroundStyle(NoirStyle.cream)
                    .shadow(color: NoirStyle.cream.opacity(0.18), radius: 8).minimumScaleFactor(0.6).lineLimit(1)
                Text("\(f.title.map { String($0.prefix(14)) } ?? "Focus") · \(f.plannedMinutes ?? 25) min").font(c.fonts.t12()).foregroundStyle(.white.opacity(0.5)).padding(.top, 4)
                    .titleSensitive(c.showTitles).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(NoirStyle.cream)
        }
        .buttonStyle(.plain)
    }

    private func medium(_ f: WidgetFocus) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                VStack {
                    NoirSun()
                    Spacer(minLength: 0)
                    Text(WidgetClock.hhmm(c.now, calendar: c.calendar)).font(c.fonts.display.font(15, weight: .heavy)).foregroundStyle(NoirStyle.cream)
                    Spacer(minLength: 0)
                    Circle().fill(NoirStyle.cream).frame(width: 4, height: 4)
                }
                .padding(.top, 12).padding(.bottom, 14)
                .frame(width: 78, height: size.height - 16)
                .background(Capsule().fill(LinearGradient(colors: [Color(rgb: 0x2B2A28), Color(rgb: 0x1A1918)], startPoint: .top, endPoint: .bottom))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.1), lineWidth: 0.5)).shadow(color: .black.opacity(0.7), radius: 6, y: 4))
                .offset(x: 8, y: 8)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .center, spacing: 12) {
                        CountdownText(focus: f, font: c.fonts.display.font(52, weight: .black)).foregroundStyle(NoirStyle.cream).minimumScaleFactor(0.5).lineLimit(1)
                        VStack(alignment: .leading, spacing: 4) { NoirCap(text: f.isPaused ? "PAUSED" : "LEFT", color: NoirStyle.cream); NoirCap(text: "IN") }
                    }
                    Text(f.title ?? "Focus").font(c.fonts.t12()).foregroundStyle(.white.opacity(0.45)).lineLimit(1).titleSensitive(c.showTitles)
                }
                .frame(maxHeight: .infinity, alignment: .center)
                .padding(.leading, 96).padding(.trailing, 12)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
            }
        }
        .widgetURL(NeedtLink.focus)
    }
}

struct NoirHabits: View {
    @Environment(\.needt) private var c
    var model: HabitsModel

    var body: some View {
        if c.family == .medium { medium } else { small }
    }

    private func dots(_ h: WidgetHabit, _ n: Int) -> [DotKind] {
        let days = h.history.suffix(n)
        return Array(repeating: DotKind.well, count: max(0, n - days.count)) + days.map { $0 ? DotKind.yellow : DotKind.well }
    }

    private var small: some View {
        let h = model.habits.max { $0.streak < $1.streak } ?? model.habits.first
        return VStack(alignment: .leading, spacing: 0) {
            HStack { Text("\(h?.streak ?? 0)").font(noirNum(c, 34)); Spacer(); NoirCap(text: "DAYS") }
            Spacer(minLength: 0)
            if let h {
                DotMatrix(cols: 7, dots: dots(h, 21))
                Text(h.title).font(c.fonts.t12()).foregroundStyle(NoirStyle.cream.opacity(0.6)).padding(.top, 8).lineLimit(1).titleSensitive(c.showTitles)
            }
        }
        .foregroundStyle(NoirStyle.cream)
        .widgetURL(NeedtLink.habits)
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .top, spacing: 3) {
                    Text("Habits").font(c.fonts.body.font(22, weight: .bold)).tracking(-0.8)
                    Text("\(model.total)").font(.system(size: 11)).opacity(0.7)
                }
                Spacer()
                NoirCap(text: "THIS WEEK")
            }
            Spacer(minLength: 0)
            VStack(spacing: 7) {
                ForEach(model.habits.prefix(3)) { h in
                    HStack(spacing: 8) {
                        Text(h.title).font(c.fonts.t12()).foregroundStyle(.white.opacity(0.75)).lineLimit(1).frame(width: 96, alignment: .leading).titleSensitive(c.showTitles)
                        DotMatrix(cols: 14, dots: dots(h, 14), gap: 6)
                    }
                }
            }
        }
        .foregroundStyle(NoirStyle.cream)
        .widgetURL(NeedtLink.habits)
    }
}

struct NoirQuickAdd: View {
    @Environment(\.needt) private var c

    var body: some View {
        Button(intent: OpenQuickAddIntent()) {
            if c.family == .control {
                Image(systemName: "plus").font(.system(size: 30, weight: .black)).foregroundStyle(Color(rgb: 0x111111)).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        NoirCap(text: "ADD A TASK", color: NoirStyle.cream.opacity(0.55))
                        NoirCap(text: "NEEDT FINDS THE TIME", color: NoirStyle.cream.opacity(0.33))
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "plus").font(.system(size: 18, weight: .semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .background(Capsule().fill(LinearGradient(colors: [.white.opacity(0.14), .white.opacity(0.03)], startPoint: .leading, endPoint: .trailing))
                            .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 0.5)))
                }
            }
        }
        .buttonStyle(.plain)
    }
}
