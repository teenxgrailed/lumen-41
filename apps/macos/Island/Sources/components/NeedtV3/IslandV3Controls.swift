import AppKit
import SwiftUI

// The island's shape and its controls (island2.css: .mbtn .mcirc .seg).
// Controls are SwiftUI Buttons with system metrics; the default button takes
// the system accent colour (controlAccentColor), nothing else is accent.

/// The black shape: square top with concave shoulders that grow out of the
/// bezel (notch screens), or a rounded pill (screens without a notch).
struct IslandV3ShapePath: Shape {
    var radius: CGFloat
    var shoulders: Bool
    /// Round the top corners too (the pill on screens without a notch).
    var roundTop = false
    var shoulder: CGFloat = 10

    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let k: CGFloat = 0.5522847498
        let b = max(0, min(radius, rect.width / 2, rect.height))
        let s = shoulder
        let t = (!shoulders && roundTop) ? max(0, min(radius, rect.width / 2, rect.height / 2)) : 0

        if shoulders {
            p.move(to: CGPoint(x: rect.minX - s, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX + s, y: rect.minY))
            // Concave right shoulder, centre (maxX + s, minY + s).
            p.addCurve(
                to: CGPoint(x: rect.maxX, y: rect.minY + s),
                control1: CGPoint(x: rect.maxX + s - k * s, y: rect.minY),
                control2: CGPoint(x: rect.maxX, y: rect.minY + s - k * s)
            )
        } else {
            p.move(to: CGPoint(x: rect.minX + t, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX - t, y: rect.minY))
            p.addCurve(
                to: CGPoint(x: rect.maxX, y: rect.minY + t),
                control1: CGPoint(x: rect.maxX - t + k * t, y: rect.minY),
                control2: CGPoint(x: rect.maxX, y: rect.minY + t - k * t)
            )
        }
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - b))
        p.addCurve(
            to: CGPoint(x: rect.maxX - b, y: rect.maxY),
            control1: CGPoint(x: rect.maxX, y: rect.maxY - b + k * b),
            control2: CGPoint(x: rect.maxX - b + k * b, y: rect.maxY)
        )
        p.addLine(to: CGPoint(x: rect.minX + b, y: rect.maxY))
        p.addCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - b),
            control1: CGPoint(x: rect.minX + b - k * b, y: rect.maxY),
            control2: CGPoint(x: rect.minX, y: rect.maxY - b + k * b)
        )
        if shoulders {
            p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + s))
            p.addCurve(
                to: CGPoint(x: rect.minX - s, y: rect.minY),
                control1: CGPoint(x: rect.minX, y: rect.minY + s - k * s),
                control2: CGPoint(x: rect.minX - s + k * s, y: rect.minY)
            )
        } else {
            p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + t))
            p.addCurve(
                to: CGPoint(x: rect.minX + t, y: rect.minY),
                control1: CGPoint(x: rect.minX, y: rect.minY + t - k * t),
                control2: CGPoint(x: rect.minX + t - k * t, y: rect.minY)
            )
        }
        p.closeSubpath()
        return p
    }
}

// MARK: - Static rendering

private struct IslandStaticKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    /// True when a view is drawn once into an image (the CI renderer): the
    /// draw-in and appear animations are skipped and the final state is shown.
    var islandStatic: Bool {
        get { self[IslandStaticKey.self] }
        set { self[IslandStaticKey.self] = newValue }
    }
}

// MARK: - Buttons

/// Capsule push button. `prominent` is the default button (system accent).
struct IslandCapsuleButtonStyle: ButtonStyle {
    var prominent = false
    var small = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: small ? 12 : 13, weight: .medium))
            .foregroundStyle(Color.white)
            .padding(.horizontal, small ? 10 : 14)
            .frame(height: small ? 24 : 28)
            .background(
                Capsule().fill(
                    prominent
                        ? IslandV3Palette.accent.opacity(configuration.isPressed ? 0.8 : 1)
                        : Color.white.opacity(configuration.isPressed ? 0.24 : 0.12)
                )
            )
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.06), lineWidth: 0.5))
            .contentShape(Capsule())
    }
}

/// Circular button (26 pt, or 32 pt large).
struct IslandCircleButtonStyle: ButtonStyle {
    var prominent = false
    var large = false
    var on = false

    func makeBody(configuration: Configuration) -> some View {
        let size: CGFloat = large ? 32 : 26
        configuration.label
            .font(.system(size: large ? 13 : 12, weight: .semibold))
            .foregroundStyle(Color.white.opacity(prominent ? 1 : 0.85))
            .frame(width: size, height: size)
            .background(
                Circle().fill(
                    prominent
                        ? IslandV3Palette.accent.opacity(configuration.isPressed ? 0.8 : 1)
                        : Color.white.opacity(on ? 0.22 : (configuration.isPressed ? 0.24 : 0.12))
                )
            )
            .contentShape(Circle())
    }
}

// MARK: - Segmented control

/// A segmented control in the macOS dark style. The highlight follows the
/// cursor while it is over the control, and returns to the selection when it
/// leaves.
struct IslandSegmented<Value: Hashable>: View {
    let items: [(Value, String)]
    @Binding var selection: Value
    @State private var hovered: Value?
    @Namespace private var ink

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.0) { item in
                let active = hovered ?? selection
                Text(item.1)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(item.0 == selection ? Color.white : Color.white.opacity(0.75))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 3)
                    .background {
                        if active == item.0 {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(Color.white.opacity(0.2))
                                .shadow(color: .black.opacity(0.4), radius: 1, y: 1)
                                .matchedGeometryEffect(id: "ink", in: ink)
                        }
                    }
                    .contentShape(Rectangle())
                    .onHover { inside in
                        if inside { hovered = item.0 } else if hovered == item.0 { hovered = nil }
                    }
                    .onTapGesture { selection = item.0 }
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.08)))
        .animation(.spring(response: 0.32, dampingFraction: 1), value: hovered)
        .animation(.spring(response: 0.32, dampingFraction: 1), value: selection)
    }
}

// MARK: - Ring

/// A progress ring. `comet` runs a light along the filled arc only (motion
/// layer: app and island, never widgets). Reduce Motion turns it off.
struct IslandRing: View {
    var progress: Double
    var size: CGFloat
    var line: CGFloat
    var color: Color = .white
    var track: Color = Color.white.opacity(0.12)
    var comet = false
    var drawIn = true

    @State private var drawn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.islandStatic) private var isStatic

    private var shown: Double { (drawn || !drawIn || isStatic) ? max(0, min(1, progress)) : 0 }

    var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: line)
            Circle()
                .trim(from: 0, to: shown)
                .stroke(color, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if comet && !reduceMotion && shown > 0.08 {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    let phase = (t.truncatingRemainder(dividingBy: 2.6)) / 2.6
                    let seg = min(0.28 * shown, 0.12)
                    let start = max(0, (shown - seg) * phase)
                    Circle()
                        .trim(from: start, to: start + seg)
                        .stroke(Color.white.opacity(0.9), style: StrokeStyle(lineWidth: line, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .blur(radius: 0.6)
                        .opacity(phase < 0.1 ? phase * 10 : (phase > 0.8 ? (1 - phase) * 5 : 1))
                }
            }
        }
        .frame(width: size, height: size)
        .animation(reduceMotion ? nil : .spring(response: 1.0, dampingFraction: 0.9), value: shown)
        .onAppear { drawn = true }
    }
}
