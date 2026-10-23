import NeedtKit
import SwiftUI
import WidgetKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// E · Lucky cat: a real photo (Unsplash, charlesdeluvio, photo S5kAe290qNs,
/// Unsplash License) cut in two. The raised paw rotates around the shoulder
/// (pivot 85.7 % / 60.9 %). WidgetKit allows at most 2 s of animation per data
/// change, so on the widget the paw does not wave: each timeline entry draws
/// one frame of the wave (`CatPaw.angle`). The continuous wave is app only
/// (`AnimatedLuckyCat`, for in-app previews); a Live Activity gets the same
/// per-update frame.
struct CatStyle: WidgetStyle {
    var id: StyleID { .cat }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .serif), mono: FontSpec(design: .monospaced)) }

    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView {
        AnyView(CatBackground(kind: kind, ctx: ctx))
    }

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? {
        ctx.family == .medium ? AnyView(CatToday(model: model)) : nil
    }

    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { AnyView(CatFocus(model: model)) }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? {
        ctx.family == .control ? AnyView(CatControl()) : nil
    }
}

enum CatPaw {
    /// The pivot of the raised paw, as a fraction of the 195 x 300 photo.
    static let pivot = UnitPoint(x: 0.857, y: 0.609)

    /// One frame of the wave for a timeline entry: neighbouring entries
    /// alternate, so a reload looks like a wave. Not running: the paw rests.
    static func angle(at date: Date, running: Bool, big: Bool = true) -> Double {
        guard running else { return 4 }
        let beat = Int(date.timeIntervalSince1970 / 60) % 2
        return big ? (beat == 0 ? 10 : -32) : (beat == 0 ? 4 : -16)
    }
}

/// The cat photo with its raised paw at `angle` degrees.
struct LuckyCat: View {
    var height: CGFloat
    var angle: Double

    var body: some View {
        ZStack {
            CatImage(name: "cat-body")
            CatImage(name: "cat-arm").rotationEffect(.degrees(angle), anchor: CatPaw.pivot)
        }
        .frame(width: height * 195 / 300, height: height)
        .shadow(color: .black.opacity(0.35), radius: 1, y: 1)
        .shadow(color: Color(rgb: 0x3C1400).opacity(0.3), radius: 7, y: 10)
        .accessibilityHidden(true)
    }
}

/// App-only: the paw really waves (a spring on a repeating phase). Never used
/// inside a widget, where WidgetKit forbids continuous animation.
struct AnimatedLuckyCat: View {
    var height: CGFloat
    var big = true
    @State private var wave = false

    var body: some View {
        LuckyCat(height: height, angle: wave ? (big ? -32 : -16) : (big ? 10 : 4))
            .onAppear { withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { wave = true } }
    }
}

private struct CatImage: View {
    let name: String

    var body: some View {
        #if os(iOS)
        if let url = (Bundle.module.url(forResource: name, withExtension: "png", subdirectory: "Cat") ?? Bundle.module.url(forResource: name, withExtension: "png")),
           let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image).resizable().scaledToFit()
        }
        #else
        if let url = (Bundle.module.url(forResource: name, withExtension: "png", subdirectory: "Cat") ?? Bundle.module.url(forResource: name, withExtension: "png")),
           let image = NSImage(contentsOf: url) {
            Image(nsImage: image).resizable().scaledToFit()
        }
        #endif
    }
}

private enum CatColor {
    static let orange = [Color(rgb: 0xF4743F), Color(rgb: 0xE45A25), Color(rgb: 0xCF4A1C)]
    static let lavender = [Color(rgb: 0xC9C2FF), Color(rgb: 0x9F93F2), Color(rgb: 0x7D70E0)]
    static let mint = [Color(rgb: 0xB9F0D6), Color(rgb: 0x7FD8B0), Color(rgb: 0x4FBF92)]
    static let gold = [Color(rgb: 0xFFE39A), Color(rgb: 0xF6C84A), Color(rgb: 0xE9A91F)]
    static let dark = Color(rgb: 0x17151E)

    static func gradient(_ c: [Color]) -> RadialGradient {
        RadialGradient(stops: [.init(color: c[0], location: 0), .init(color: c[1], location: 0.6), .init(color: c[2], location: 1)],
                       center: UnitPoint(x: 0.3, y: 0.1), startRadius: 0, endRadius: 200)
    }
}

struct CatBackground: View {
    var kind: NeedtWidgetKind
    var ctx: RenderContext

    var body: some View {
        if kind == .today && ctx.family == .medium {
            (ctx.isDark ? Color(rgb: 0x17161F) : Color(rgb: 0xF6EFE4))
        } else {
            CatColor.gradient(CatColor.orange)
        }
    }
}

/// The round play / pause button and the dark time capsule.
private struct CatControls: View {
    @Environment(\.needt) private var c
    var focus: WidgetFocus
    var timeSize: CGFloat
    var fixedTimeWidth: CGFloat? = nil

    private var running: Bool { !focus.isPaused }

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: ToggleFocusPauseWidgetIntent(sessionId: focus.sessionId, paused: focus.isPaused)) {
                Circle().fill(CatColor.dark).frame(width: 46, height: 46)
                    .overlay {
                        Circle().fill(RadialGradient(colors: [Color(rgb: 0xF3D2FF), Color(rgb: 0xD9A8F5), Color(rgb: 0xC48BE8)], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 24))
                            .frame(width: 34, height: 34)
                            .overlay(Image(systemName: running ? "pause.fill" : "play.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(CatColor.dark))
                    }
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 2)
            }
            .buttonStyle(.plain)
            CountdownText(focus: focus, font: .system(size: timeSize, weight: .semibold))
                .foregroundStyle(running ? Color(rgb: 0xE9E6F2) : Color(rgb: 0xE9E6F2).opacity(0.6))
                .lineLimit(1).minimumScaleFactor(0.7)
                .padding(.horizontal, 12)
                .frame(width: fixedTimeWidth, height: 46)
                .frame(maxWidth: fixedTimeWidth == nil ? .infinity : nil)
                .background(Capsule().fill(Color(rgb: 0x1D1B24)).overlay(Capsule().strokeBorder(Color.white.opacity(0.08), lineWidth: 0.5)))
        }
    }
}

struct CatFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        guard let f = model.focus else { return AnyView(EmptyView()) }
        return AnyView(content(f))
    }

    private func left(_ f: WidgetFocus) -> Int { f.secondsLeft(at: c.now) ?? Int.max }

    @ViewBuilder
    private func content(_ f: WidgetFocus) -> some View {
        let running = !f.isPaused && model.state == .running
        if model.state == .finished {
            finished(f)
        } else if c.family == .medium {
            medium(f, running)
        } else {
            small(f, running)
        }
    }

    private func small(_ f: WidgetFocus, _ running: Bool) -> some View {
        let almost = running && left(f) <= 120
        let colors = almost ? CatColor.mint : (running ? CatColor.lavender : CatColor.orange)
        return FullBleed { size in
            ZStack(alignment: .bottom) {
                CatColor.gradient(colors)
                LuckyCat(height: almost ? 104 : (running ? 118 : 108), angle: CatPaw.angle(at: c.now, running: running))
                    .frame(maxHeight: .infinity, alignment: .bottom).offset(y: 2)
                VStack(alignment: .leading, spacing: 0) {
                    if almost {
                        CatControls(focus: f, timeSize: 16)
                        Spacer(minLength: 0)
                        Text("Almost done").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 10).frame(height: 22).background(Capsule().fill(BentoStyle.ink))
                    } else {
                        if !running { CatControls(focus: f, timeSize: 17); Spacer(minLength: 0) } else { Spacer(minLength: 0); CatControls(focus: f, timeSize: 16) }
                    }
                }
                .padding(12)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
            }
            .frame(width: size.width, height: size.height)
        }
        .widgetURL(NeedtLink.focus)
    }

    private func medium(_ f: WidgetFocus, _ running: Bool) -> some View {
        FullBleed { size in
            ZStack(alignment: .bottomTrailing) {
                CatColor.gradient(CatColor.orange)
                LuckyCat(height: 146, angle: CatPaw.angle(at: c.now, running: running))
                    .padding(.trailing, 26).offset(y: 4)
                VStack(alignment: .leading, spacing: 0) {
                    CatControls(focus: f, timeSize: 19, fixedTimeWidth: 150)
                    Spacer(minLength: 0)
                    Text("Focus · \(f.plannedMinutes ?? 25) min").font(c.fonts.t12(.semibold)).foregroundStyle(Color(rgb: 0x17151E).opacity(0.6))
                    Text(f.title ?? "Focus").font(c.fonts.t13(.semibold)).foregroundStyle(CatColor.dark).lineLimit(1).titleSensitive(c.showTitles)
                }
                .padding(14)
                .padding(.trailing, 150)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
            }
            .frame(width: size.width, height: size.height)
        }
        .widgetURL(NeedtLink.focus)
    }

    /// E7: the cat hops when the block is done.
    private func finished(_ f: WidgetFocus) -> some View {
        FullBleed { size in
            ZStack(alignment: .bottom) {
                CatColor.gradient(CatColor.gold)
                LuckyCat(height: 104, angle: -16).frame(maxHeight: .infinity, alignment: .bottom)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Focus done").font(c.fonts.t12(.semibold)).foregroundStyle(CatColor.dark.opacity(0.6))
                    Text("\(f.plannedMinutes ?? 25) min of focus").font(c.fonts.t13(.semibold)).foregroundStyle(CatColor.dark)
                }
                .padding(12)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
            }
            .frame(width: size.width, height: size.height)
        }
        .widgetURL(NeedtLink.focus)
    }
}

struct CatToday: View {
    @Environment(\.needt) private var c
    var model: TodayModel

    var body: some View {
        let ink = c.isDark ? Color(rgb: 0xF3F1FF) : CatColor.dark
        FullBleed { size in
            ZStack(alignment: .topLeading) {
                CatColor.gradient(CatColor.orange)
                    .frame(width: 120, height: size.height)
                    .offset(x: size.width - 120)
                LuckyCat(height: 138, angle: CatPaw.angle(at: c.now, running: true))
                    .frame(width: size.width, height: size.height, alignment: .bottomTrailing).offset(x: -12, y: 4)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("TODAY").font(.system(size: 12, weight: .heavy)).tracking(0.5)
                        Spacer()
                        Text("\(model.left) left").font(c.fonts.t12(.semibold)).opacity(0.55)
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(model.openRows().prefix(4)) { r in
                            StyledCheck(title: r.title, done: r.done, taskId: r.id, font: c.fonts.t13(.semibold), color: ink, trailing: r.time,
                                        trailingColor: ink.opacity(0.5)) { on in
                                ZStack {
                                    Circle().strokeBorder(RGB(hex: r.colorHex, fallback: 0x8F7DFF).color(), lineWidth: 1.6)
                                    if on { Circle().fill(RGB(hex: r.colorHex, fallback: 0x8F7DFF).color()) }
                                }.frame(width: 16, height: 16)
                            }
                        }
                    }.padding(.top, 10)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(ink)
                .padding(16).padding(.trailing, 120)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
            }
            .frame(width: size.width, height: size.height)
        }
        .widgetURL(NeedtLink.today)
    }
}

struct CatControl: View {
    var body: some View {
        ZStack(alignment: .bottom) {
            CatColor.gradient(CatColor.orange)
            LuckyCat(height: 84, angle: 4).offset(y: 26)
        }
        .clipped()
    }
}
