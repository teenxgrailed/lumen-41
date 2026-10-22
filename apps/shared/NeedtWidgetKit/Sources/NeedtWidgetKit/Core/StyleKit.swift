import NeedtKit
import SwiftUI

// Helpers the seven non-Ink styles share. The lab draws each widget on a
// 158 x 158 (or 338 x 158) canvas with decorations that run to the edge and
// content inset by 16; `FullBleed` gives the views that same canvas inside the
// 16 pt content margin WidgetKit hands them, so lab coordinates map 1:1.

struct FullBleed<Content: View>: View {
    var margin: CGFloat = 16
    @ViewBuilder var content: (CGSize) -> Content

    var body: some View {
        GeometryReader { geo in
            let size = CGSize(width: geo.size.width + 2 * margin, height: geo.size.height + 2 * margin)
            content(size)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                .offset(x: -margin, y: -margin)
        }
    }
}

extension View {
    /// Content inset 16 from the canvas edge (`.pad`).
    func pad(_ size: CGSize, _ inset: CGFloat = 16) -> some View {
        self.padding(inset).frame(width: size.width, height: size.height, alignment: .topLeading)
    }

    /// A rect placed by its edges on the canvas.
    func placed(_ size: CGSize, left: CGFloat? = nil, right: CGFloat? = nil, top: CGFloat? = nil, bottom: CGFloat? = nil,
                width: CGFloat? = nil, height: CGFloat? = nil) -> some View {
        let w = width ?? (left != nil && right != nil ? size.width - left! - right! : nil)
        let h = height ?? (top != nil && bottom != nil ? size.height - top! - bottom! : nil)
        let x = left ?? (right != nil && w != nil ? size.width - right! - w! : 0)
        let y = top ?? (bottom != nil && h != nil ? size.height - bottom! - h! : 0)
        return self.frame(width: w, height: h).offset(x: x, y: y)
            .frame(width: size.width, height: size.height, alignment: .topLeading)
    }
}

/// A filled rounded rectangle with a lit top rim and a contact shadow: the
/// frosted "glass" of Sky and Rim, the tiles of Bento.
struct Lit: ViewModifier {
    var fill: Color
    var radius: CGFloat
    var rim: Double = 0.6
    var shadow: Color = .black.opacity(0.18)

    func body(content: Content) -> some View {
        content.background {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(fill)
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(LinearGradient(colors: [.white.opacity(rim), .white.opacity(0.06)], startPoint: .top, endPoint: .bottom), lineWidth: 0.5)
                )
                .shadow(color: shadow, radius: 6, y: 4)
        }
    }
}

extension View {
    func lit(_ fill: Color, radius: CGFloat = 14, rim: Double = 0.6, shadow: Color = .black.opacity(0.18)) -> some View {
        modifier(Lit(fill: fill, radius: radius, rim: rim, shadow: shadow))
    }
}

/// The sun, moon or evening sun of Sky (`.sun`).
struct SunOrb: View {
    enum Kind { case day, moon, eve }
    var kind: Kind = .day
    var size: CGFloat = 18

    var body: some View {
        let colors: [Color]
        let glow: Color
        switch kind {
        case .day: colors = [Color(rgb: 0xFFF9D6), Color(rgb: 0xFFD23A), Color(rgb: 0xFFB000)]; glow = Color(rgb: 0xFFC83C)
        case .moon: colors = [.white, Color(rgb: 0xDCDCF0), Color(rgb: 0xA9A9C8)]; glow = .white
        case .eve: colors = [.white, Color(rgb: 0xFFD9A0), Color(rgb: 0xFF9D4A)]; glow = Color(rgb: 0xFFAA5A)
        }
        return Circle()
            .fill(RadialGradient(colors: colors, center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0, endRadius: size * 0.7))
            .frame(width: size, height: size)
            .background(Circle().fill(glow.opacity(kind == .moon ? 0.12 : 0.28)).frame(width: size + 8, height: size + 8))
            .shadow(color: glow.opacity(kind == .moon ? 0.5 : 0.7), radius: size * 0.7)
    }
}

/// `arcSun` of wg.js: a sun riding a circle whose edge crosses the widget.
/// `l` is how far the circle overhangs each side, `b` how far its bottom sits
/// below the canvas (both as fractions).
struct SkyArc: View {
    var p: Double
    var size: CGSize
    var l: CGFloat = 0.14
    var b: CGFloat = 0.62
    var night = false
    var sun: SunOrb.Kind = .day
    var sunSize: CGFloat = 18
    /// Width the arc geometry is computed for (the lab clips it to a region).
    var arcWidth: CGFloat? = nil

    var body: some View {
        let w = arcWidth ?? size.width
        let h = size.height
        let d = w * (1 + 2 * l)
        let r = d / 2 - 3.5
        let cx = w / 2
        let cy = h + b * h - d / 2
        let vis = min(1, max(0.05, (cy - 8) / r))
        let span = asin(vis)
        let a0 = Double.pi / 2 + span * 0.82
        let a1 = Double.pi / 2 - span * 0.82
        let a = a0 + (a1 - a0) * p
        return ZStack(alignment: .topLeading) {
            Circle()
                .strokeBorder(Color.white.opacity(night ? 0.14 : 0.45), lineWidth: 7)
                .frame(width: d, height: d)
                .shadow(color: .white.opacity(night ? 0.08 : 0.28), radius: 14)
                .position(x: cx, y: cy)
            SunOrb(kind: sun, size: sunSize)
                .position(x: cx + r * CGFloat(cos(a)), y: cy - r * CGFloat(sin(a)))
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .clipped()
    }
}

/// A plain ring in any colour (Sky, Noir, Mist, Rim, Bento).
struct ColorRing: View {
    var progress: Double
    var diameter: CGFloat
    var lineWidth: CGFloat
    var color: Color
    var track: Color

    var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle().trim(from: 0, to: max(0.001, min(1, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .motion(value: progress)
        }
        .frame(width: diameter, height: diameter)
    }
}

/// A circular check with the style's own colours (Sky `.ck`).
struct RoundCheck: View {
    var on: Bool
    var color: Color
    var fill: Color

    var body: some View {
        ZStack {
            if on {
                Circle().fill(color)
                Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(fill)
            } else {
                Circle().strokeBorder(color.opacity(0.7), lineWidth: 1.5)
            }
        }
        .frame(width: 16, height: 16)
    }
}

/// The styled equivalent of `CheckRow`: a Toggle bound to the App Intent in a
/// widget, a plain row in a snapshot.
struct StyledCheck<Mark: View>: View {
    @Environment(\.needt) private var c
    var title: String
    var done: Bool
    var taskId: String? = nil
    var habitId: String? = nil
    var font: Font
    var color: Color
    var strike = false
    var trailing: String? = nil
    var trailingColor: Color? = nil
    @ViewBuilder var mark: (Bool) -> Mark

    var body: some View {
        if !c.isSnapshot, let taskId {
            Toggle(isOn: done, intent: ToggleTaskIntent(taskId: taskId)) { label }.toggleStyle(MarkToggleStyle(mark: mark))
        } else if !c.isSnapshot, let habitId {
            Toggle(isOn: done, intent: ToggleHabitIntent(habitId: habitId)) { label }.toggleStyle(MarkToggleStyle(mark: mark))
        } else {
            HStack(spacing: 8) { mark(done); label }
        }
    }

    private var label: some View {
        HStack(spacing: 6) {
            Text(title).font(font).foregroundStyle(color).strikethrough(strike && done).lineLimit(1).titleSensitive(c.showTitles)
            if let trailing {
                Spacer(minLength: 4)
                Text(trailing).font(c.fonts.t12()).monospacedDigit().foregroundStyle(trailingColor ?? color.opacity(0.6)).lineLimit(1)
            }
        }
    }
}

struct MarkToggleStyle<Mark: View>: ToggleStyle {
    var mark: (Bool) -> Mark
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { mark(configuration.isOn); configuration.label }
    }
}

/// Today's headline numbers every style uses.
extension TodayModel {
    var nextTask: TodayRow? { rows.first { !$0.done } }
    func openRows() -> [TodayRow] { rows.filter { !$0.done } }
}

/// An sRGB colour that can be mixed (the lab uses `color-mix`).
struct RGB: Equatable {
    var r: Double, g: Double, b: Double

    init(_ hex: UInt32) {
        r = Double((hex >> 16) & 0xFF) / 255
        g = Double((hex >> 8) & 0xFF) / 255
        b = Double(hex & 0xFF) / 255
    }

    init(r: Double, g: Double, b: Double) { self.r = r; self.g = g; self.b = b }

    /// "#rrggbb"; falls back to `fallback`.
    init(hex: String?, fallback: UInt32) {
        var text = hex?.trimmingCharacters(in: .whitespaces) ?? ""
        if text.hasPrefix("#") { text.removeFirst() }
        self.init(UInt32(text, radix: 16).flatMap { text.count == 6 ? $0 : nil } ?? fallback)
    }

    /// `self` at `amount` mixed with `other` (0 = self, 1 = other).
    func mixed(_ other: RGB, _ amount: Double) -> RGB {
        RGB(r: r + (other.r - r) * amount, g: g + (other.g - g) * amount, b: b + (other.b - b) * amount)
    }

    func color(_ opacity: Double = 1) -> Color { Color(.sRGB, red: r, green: g, blue: b, opacity: opacity) }

    static let white = RGB(0xFFFFFF)
    static let black = RGB(0x000000)
}

/// A Toggle that draws only its label, for rows that carry their own state.
struct LabelOnlyToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
}
