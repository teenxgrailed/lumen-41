import NeedtKit
import SwiftUI
import WidgetKit

/// H · Rim: every surface sits in a thick frosted-glass rim; pills carry their
/// own rim. Palette charcoal #282B28, orange #D26F3B, pink #EFB9C6, green
/// #759D53, grey #D6D6D6. Type: Urbanist.
struct RimStyle: WidgetStyle {
    var id: StyleID { .rim }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(name: "Urbanist"), display: FontSpec(design: .serif), mono: FontSpec(design: .monospaced)) }

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        // The rim itself: a frosted gradient the panels sit in.
        if ctx.isDark {
            return AnyView(ZStack {
                Color(rgb: 0x23242A)
                LinearGradient(stops: [.init(color: .white.opacity(0.22), location: 0), .init(color: .white.opacity(0.06), location: 0.45), .init(color: .white.opacity(0.14), location: 1)], startPoint: .topLeading, endPoint: .bottomTrailing)
            })
        }
        return AnyView(LinearGradient(stops: [.init(color: .white.opacity(0.85), location: 0), .init(color: .white.opacity(0.35), location: 0.45), .init(color: .white.opacity(0.6), location: 1)], startPoint: .topLeading, endPoint: .bottomTrailing)
            .background(Color(rgb: 0xD9DBE0)))
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { AnyView(RimToday(model: model)) }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { AnyView(RimNext(model: model)) }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(RimFocus(model: model)) }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { AnyView(RimHabits(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { AnyView(RimQuickAdd()) }
}

enum RimTexture {
    case turf, pink, orange, char

    var fill: AnyView {
        switch self {
        case .turf:
            return AnyView(ZStack {
                LinearGradient(colors: [Color(rgb: 0x4F7A45), Color(rgb: 0x2B4A2A), Color(rgb: 0x1C321D)], startPoint: .topLeading, endPoint: .bottomTrailing)
                RadialGradient(colors: [Color(rgb: 0xAAC88C).opacity(0.35), .clear], center: UnitPoint(x: 0.3, y: 0.2), startRadius: 0, endRadius: 120)
            })
        case .pink:
            return AnyView(ZStack {
                LinearGradient(colors: [Color(rgb: 0xF3C4CF), Color(rgb: 0xE7A8B8)], startPoint: .topLeading, endPoint: .bottomTrailing)
                RadialGradient(colors: [Color(rgb: 0xFBE3EA), .clear], center: UnitPoint(x: 0.3, y: 0.2), startRadius: 0, endRadius: 110)
            })
        case .orange:
            return AnyView(ZStack {
                LinearGradient(colors: [Color(rgb: 0xD9743E), Color(rgb: 0xB85A2C)], startPoint: .topLeading, endPoint: .bottomTrailing)
                RadialGradient(colors: [Color(rgb: 0xF29A64), .clear], center: UnitPoint(x: 0.3, y: 0.15), startRadius: 0, endRadius: 110)
            })
        case .char:
            return AnyView(LinearGradient(colors: [Color(rgb: 0x363936), Color(rgb: 0x222422)], startPoint: .top, endPoint: .bottom))
        }
    }
}

/// `.hin`: the panel inside the rim, radius 18, with a pressed inner edge.
struct RimPanel<Content: View>: View {
    var texture: RimTexture
    var radius: CGFloat = 18
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack(alignment: .topLeading) {
            texture.fill
            content()
        }
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.black.opacity(0.18), lineWidth: 0.75))
        .shadow(color: .white.opacity(0.6), radius: 0, y: 1)
    }
}

/// A pill with its own rim (`.hpill`).
struct RimPill: View {
    @Environment(\.needt) private var c
    var title: String
    var symbol: String?
    var color: Color

    var body: some View {
        HStack(spacing: 7) {
            if let symbol {
                Image(systemName: symbol).font(.system(size: 10, weight: .bold)).frame(width: 22, height: 22)
                    .background(Circle().fill(Color.white.opacity(0.25)))
            }
            Text(title).font(c.fonts.t13(.semibold)).lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(.leading, symbol == nil ? 12 : 4).padding(.trailing, 12).frame(height: 30)
        .background(Capsule().fill(color).shadow(color: .black.opacity(0.4), radius: 6, y: 5))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.5), lineWidth: 4).padding(-4).opacity(0.5))
    }
}

/// The white "copy" button (`.hcopy`).
struct RimCopy: View {
    @Environment(\.needt) private var c
    var title: String
    var symbol: String?

    var body: some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.system(size: 11, weight: .bold)) }
            Text(title).font(c.fonts.t13(.semibold)).lineLimit(1).fixedSize()
        }
        .foregroundStyle(Color(rgb: 0x222222))
        .padding(.horizontal, 14).frame(height: 30)
        .background(Capsule().fill(LinearGradient(colors: [Color(rgb: 0xFBFBFB), Color(rgb: 0xE2E2E2)], startPoint: .top, endPoint: .bottom)).shadow(color: .black.opacity(0.5), radius: 6, y: 5))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.4), lineWidth: 4).padding(-4).opacity(0.5))
    }
}

private struct RimOrb: View {
    var size: CGFloat
    var green = false

    var body: some View {
        let colors: [Color] = green ? [Color(rgb: 0xC9E3B8), Color(rgb: 0x759D53), Color(rgb: 0x3A5A2A), Color(rgb: 0x1F2F17)]
                                    : [Color(rgb: 0xFDE4EC), Color(rgb: 0xEFB9C6), Color(rgb: 0xB97A8A), Color(rgb: 0x5E3C45)]
        return Circle().fill(RadialGradient(stops: [.init(color: colors[0], location: 0), .init(color: colors[1], location: 0.35), .init(color: colors[2], location: 0.7), .init(color: colors[3], location: 1)],
                                            center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: size * 0.8))
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(Color.white.opacity(0.22), lineWidth: 4).padding(-4))
            .shadow(color: .black.opacity(0.6), radius: 8, y: 8)
    }
}

private func hbig(_ c: RenderContext, _ size: CGFloat) -> Font { c.fonts.num(size) }

struct RimToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                if c.family == .medium { medium(size) } else { small(size) }
            }
        }
        .widgetURL(NeedtLink.today)
    }

    private func small(_ size: CGSize) -> some View {
        RimPanel(texture: .char) {
            VStack(alignment: .leading, spacing: 0) {
                RimPill(title: "Today", symbol: "checkmark", color: Color(rgb: 0xD26F3B))
                Spacer(minLength: 0)
                Text("\(model.left)").font(hbig(c, 46)).foregroundStyle(.white).shadow(color: .black.opacity(0.25), radius: 5, y: 2)
                Text("tasks left · \(model.done) done").font(c.fonts.t12()).foregroundStyle(.white.opacity(0.6))
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
    }

    private func medium(_ size: CGSize) -> some View {
        RimPanel(texture: .turf) {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 10) {
                    Text("\(model.left) tasks left").font(hbig(c, 34)).foregroundStyle(.white).shadow(color: .black.opacity(0.25), radius: 5, y: 2)
                    RimCopy(title: "Next · \(model.nextTask.map { "\($0.title) \($0.time ?? "")" } ?? "nothing")", symbol: nil)
                        .titleSensitive(c.showTitles)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LinearGradient(colors: [Color(rgb: 0xA6C98F), Color(rgb: 0x6F9A57)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.white.opacity(0.55), lineWidth: 4).padding(-4))
                    .rotationEffect(.degrees(6)).padding(14)
            }
        }
        .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
    }
}

struct RimNext: View {
    @Environment(\.needt) private var c
    var model: NextModel

    var body: some View {
        guard let e = model.event else { return AnyView(EmptyView()) }
        return AnyView(content(e))
    }

    private func hhmm(_ d: Date) -> String { WidgetClock.hhmm(d, calendar: c.calendar) }

    @ViewBuilder
    private func content(_ e: WidgetEvent) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                if c.family == .medium {
                    RimPanel(texture: .char) {
                        VStack(spacing: 0) {
                            RimOrb(size: 52)
                            HStack(spacing: 6) {
                                ForEach([0xD26F3B, 0xEFB9C6, 0x759D53, 0x111111], id: \.self) { Circle().fill(Color(rgb: UInt32($0))).frame(width: 16, height: 16) }
                            }
                            .padding(5).background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.08))).padding(.top, 8)
                            Spacer(minLength: 0)
                            RimCopy(title: "Open", symbol: nil)
                        }
                        .padding(12).foregroundStyle(.white)
                    }
                    .frame(width: 150, height: size.height - 14).offset(x: 7, y: 7)
                    RimPanel(texture: .orange) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Next\(e.location.map { " · \($0)" } ?? "")").font(c.fonts.t12(.semibold)).opacity(0.75)
                            Spacer(minLength: 0)
                            Text(e.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                            Text(hhmm(e.start)).font(hbig(c, 40))
                            if let a = model.after { Text("then \(a.title) \(hhmm(a.start))").font(c.fonts.t12()).opacity(0.75).lineLimit(1).titleSensitive(c.showTitles) }
                        }
                        .padding(12).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                    .frame(width: size.width - 164 - 7, height: size.height - 14).offset(x: 164, y: 7)
                } else {
                    RimPanel(texture: .pink) {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(spacing: 3) { Text("Next ·"); UntilText(date: e.start) }.font(c.fonts.t12(.semibold)).opacity(0.6)
                            Spacer(minLength: 0)
                            Text(hhmm(e.start)).font(hbig(c, 46)).foregroundStyle(Color(rgb: 0x2A161C))
                            Text(e.title).font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                        }
                        .padding(12).foregroundStyle(Color(rgb: 0x3A2228))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                    .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
                }
            }
        }
        .widgetURL(NeedtLink.calendar)
    }
}

struct RimFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        guard let f = model.focus else { return AnyView(EmptyView()) }
        return AnyView(content(f))
    }

    /// The small pill holds about 14 characters: cut at a word and end with an ellipsis, never mid-word.
    static func pillTitle(_ t: String, limit: Int = 14) -> String {
        guard t.count > limit else { return t }
        var out = ""
        for w in t.split(separator: " ") {
            let next = out.isEmpty ? String(w) : out + " " + w
            if next.count > limit - 1 { break }
            out = next
        }
        return (out.isEmpty ? String(t.prefix(limit - 1)) : out) + "…"
    }

    @ViewBuilder
    private func content(_ f: WidgetFocus) -> some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                if c.family == .medium {
                    RimPanel(texture: .char) {
                        HStack(spacing: 14) {
                            RimOrb(size: 96, green: true)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("Focus · \(f.title ?? "Focus")").font(c.fonts.t12()).foregroundStyle(.white.opacity(0.55)).lineLimit(1).titleSensitive(c.showTitles)
                                CountdownText(focus: f, font: hbig(c, 42)).foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1)
                                HStack(spacing: 8) {
                                    Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
                                        RimCopy(title: f.isPaused ? "Resume" : "Pause", symbol: f.isPaused ? "play.fill" : "pause.fill")
                                    }.buttonStyle(.plain)
                                    Button(intent: FinishFocusWidgetIntent(sessionId: f.sessionId)) {
                                        RimPill(title: "Done", symbol: "checkmark", color: Color(rgb: 0x759D53))
                                    }.buttonStyle(.plain)
                                }.padding(.top, 6)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    }
                    .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
                } else {
                    RimPanel(texture: .turf) {
                        VStack(spacing: 8) {
                            ZStack {
                                FocusRing(focus: f, diameter: 84, lineWidth: 4, tint: .white.opacity(0.95), track: .white.opacity(0.2))
                                CountdownText(focus: f, font: hbig(c, 22)).foregroundStyle(.white).minimumScaleFactor(0.6).frame(width: 60)
                            }
                            RimCopy(title: Self.pillTitle(f.title ?? "Focus"), symbol: nil).titleSensitive(c.showTitles)
                        }
                        .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
                }
            }
        }
        .widgetURL(NeedtLink.focus)
    }
}

struct RimHabits: View {
    @Environment(\.needt) private var c
    var model: HabitsModel

    var body: some View {
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                if c.family == .medium { medium(size) } else { small(size) }
            }
        }
        .widgetURL(NeedtLink.habits)
    }

    private func small(_ size: CGSize) -> some View {
        let h = model.habits.max { $0.streak < $1.streak } ?? model.habits.first
        return RimPanel(texture: .pink) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(h?.title ?? "Habits").font(c.fonts.t13(.semibold)).lineLimit(1).titleSensitive(c.showTitles)
                    Spacer()
                    Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 26, height: 26)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(LinearGradient(colors: [Color(rgb: 0xA6C98F), Color(rgb: 0x6F9A57)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                }
                Spacer(minLength: 0)
                Text("\(h?.streak ?? 0)").font(hbig(c, 46)).foregroundStyle(Color(rgb: 0x2A161C))
                Text("days in a row").font(c.fonts.t12(.semibold)).opacity(0.6)
            }
            .padding(12).foregroundStyle(Color(rgb: 0x2A161C))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
    }

    private func medium(_ size: CGSize) -> some View {
        let palette: [(Color, Color)] = [(Color(rgb: 0x282B28), .white), (Color(rgb: 0xD26F3B), .white), (Color(rgb: 0xEFB9C6), Color(rgb: 0x2A161C)),
                                         (Color(rgb: 0x759D53), .white), (Color(rgb: 0xD6D6D6), Color(rgb: 0x222222))]
        let habits = Array(model.habits.prefix(5))
        return ZStack {
            (c.isDark ? Color(rgb: 0x1D1F1D) : Color(rgb: 0xF4F5F3))
            HStack(spacing: 6) {
                ForEach(Array(habits.enumerated()), id: \.element.id) { i, h in
                    let p = palette[i % palette.count]
                    VStack(alignment: .leading, spacing: 3) {
                        Spacer(minLength: 0)
                        Text(h.streak > 0 ? "\(h.streak) d" : (h.doneToday ? "1" : "0")).font(hbig(c, 22)).foregroundStyle(p.1)
                        Text(h.title).font(c.fonts.t12(.semibold)).opacity(0.7).lineLimit(1).titleSensitive(c.showTitles).foregroundStyle(p.1)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(p.0)
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.25), lineWidth: 0.5))
                        .shadow(color: .black.opacity(0.25), radius: 5, y: 3))
                }
            }
            .padding(8)
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
    }
}

struct RimQuickAdd: View {
    @Environment(\.needt) private var c

    var body: some View {
        Button(intent: OpenQuickAddIntent()) {
            if c.family == .control {
                Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(RimTexture.orange.fill).clipShape(Circle()).padding(6)
            } else {
                FullBleed { size in
                    RimPanel(texture: .char) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Quick add").font(c.fonts.t13(.semibold))
                            Text("Needt finds the time").font(c.fonts.t12()).foregroundStyle(.white.opacity(0.5))
                            Spacer(minLength: 0)
                            HStack(spacing: 6) {
                                ForEach([0xD26F3B, 0xEFB9C6, 0x759D53], id: \.self) { Circle().fill(Color(rgb: UInt32($0))).frame(width: 16, height: 16) }
                            }
                            .padding(5).background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.08))).padding(.bottom, 10)
                            RimCopy(title: "Add a task", symbol: "plus")
                        }
                        .padding(12).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                    .frame(width: size.width - 14, height: size.height - 14).offset(x: 7, y: 7)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
