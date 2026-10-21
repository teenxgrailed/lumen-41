import NeedtKit
import SwiftUI
import WidgetKit

// The small parts D · Ink is built from (pack.html and wg.css `.ink`): a
// 16 pt check box, the accent mark, the ring, wells and cards, placeholder
// bars. Accent is only ever a mark and always `widgetAccentable`.

/// The accent dot with its 3 pt halo (`.mk`).
struct InkMark: View {
    @Environment(\.needt) private var c
    var size: CGFloat = 6

    var body: some View {
        Circle()
            .fill(c.palette.accent)
            .frame(width: size, height: size)
            .background(Circle().fill(c.palette.accent.opacity(0.18)).frame(width: size + 6, height: size + 6))
            .frame(width: size + 6, height: size + 6)
            .widgetAccentable()
            .accessibilityHidden(true)
    }
}

/// The 16 pt check box (`.ckb`): outlined, or ink-filled with a check.
struct InkCheckBox: View {
    @Environment(\.needt) private var c
    var on: Bool

    var body: some View {
        ZStack {
            if on {
                RoundedRectangle(cornerRadius: 5, style: .continuous).fill(c.palette.ink)
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundStyle(c.palette.isMonochrome ? Color.black : c.palette.bg)
            } else {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .strokeBorder(c.palette.checkBorder, lineWidth: 1.5)
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// A ring; `progress` 0...1 drawn clockwise from 12 o'clock. The stroke is the
/// accent mark, the track is the ink at 8%.
struct InkRing: View {
    @Environment(\.needt) private var c
    var progress: Double
    var diameter: CGFloat
    var lineWidth: CGFloat
    var tint: Color? = nil
    var track: Color? = nil
    var frozen = false

    var body: some View {
        ZStack {
            Circle().stroke(track ?? c.palette.ink.opacity(c.palette.isMonochrome ? 0.2 : 0.08), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, progress)))
                .stroke(tint ?? (frozen ? c.palette.ink : c.palette.accent),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .widgetAccentable(!frozen)
        }
        .frame(width: diameter, height: diameter)
    }
}

/// A card: the page colour with a hairline and a soft contact shadow.
struct InkCard: ViewModifier {
    @Environment(\.needt) private var c
    var radius: CGFloat = 16

    func body(content: Content) -> some View {
        content.background {
            if c.isFullColor {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(c.palette.card)
                    .shadow(color: .black.opacity(c.isDark ? 0.5 : 0.08), radius: 1, y: 1)
                    .shadow(color: (c.isDark ? Color.black : Color(rgb: 0x100E28)).opacity(c.isDark ? 0.5 : 0.18), radius: 7, y: 5)
                    .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(c.palette.ink.opacity(c.isDark ? 0.08 : 0.10), lineWidth: 0.5))
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(c.palette.card)
            }
        }
    }
}

/// A recessed well (`.well`): ink at 5%.
struct InkWell: ViewModifier {
    @Environment(\.needt) private var c
    var radius: CGFloat = 14

    func body(content: Content) -> some View {
        content.background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(c.palette.well))
    }
}

extension View {
    func inkCard(radius: CGFloat = 16) -> some View { modifier(InkCard(radius: radius)) }
    func inkWell(radius: CGFloat = 14) -> some View { modifier(InkWell(radius: radius)) }

    /// Marks text that names a person's work so it redacts on a locked device
    /// unless "Show titles on Lock Screen" is on.
    @ViewBuilder
    func titleSensitive(_ show: Bool) -> some View {
        if show { self } else { self.privacySensitive() }
    }
}

/// The outlined pill button label (`.ibtn`): never a solid accent fill.
struct InkButtonLabel: View {
    @Environment(\.needt) private var c
    var symbol: String?
    var title: String?
    var height: CGFloat = 32
    var wide = false

    var body: some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.system(size: 12, weight: .bold)) }
            if let title { Text(title).font(c.fonts.t13(.semibold)).lineLimit(1).fixedSize(horizontal: true, vertical: false) }
        }
        .foregroundStyle(c.palette.ink)
        .padding(.horizontal, 14)
        .frame(height: height)
        .frame(maxWidth: wide ? .infinity : nil)
        .background {
            Capsule().fill(c.palette.card)
                .overlay(Capsule().strokeBorder(c.palette.ink.opacity(c.isFullColor ? 0.14 : 0.35), lineWidth: 0.5))
                .shadow(color: .black.opacity(c.isFullColor ? (c.isDark ? 0.4 : 0.12) : 0), radius: 1, y: 1)
        }
    }
}

/// A shape standing in for text while WidgetKit loads. Never real data.
struct PlaceholderBar: View {
    @Environment(\.needt) private var c
    var width: CGFloat
    var height: CGFloat = 10
    var round = false

    var body: some View {
        RoundedRectangle(cornerRadius: round ? height / 2 : 4, style: .continuous)
            .fill(c.palette.placeholder)
            .frame(width: width, height: height)
    }
}

/// A calm centred state: glyph, one line, an optional second line.
struct StateCenter: View {
    @Environment(\.needt) private var c
    var symbol: String
    var title: String
    var detail: String?

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 18, weight: .medium)).foregroundStyle(c.palette.a3)
            Text(title).font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink).multilineTextAlignment(.center)
            if let detail {
                Text(detail).font(c.fonts.t12()).foregroundStyle(c.palette.a2).multilineTextAlignment(.center)
            }
        }
        .lineLimit(2)
        .minimumScaleFactor(0.85)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// "Updated 14:05" with a crossed cloud: the stale line.
struct StaleLine: View {
    @Environment(\.needt) private var c
    var date: Date

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "icloud.slash").font(.system(size: 11))
            Text(WidgetClock.updated(date, calendar: c.calendar)).font(c.fonts.t12())
        }
        .foregroundStyle(c.palette.a3)
        .lineLimit(1)
    }
}

/// "Could not sync. Try again." The one place colour is used for state, and it
/// still carries a glyph and words.
struct FailureLine: View {
    @Environment(\.needt) private var c

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 11, weight: .semibold))
            Text("Could not sync. Try again.").font(c.fonts.t12())
        }
        .foregroundStyle(c.palette.isMonochrome ? c.palette.ink : c.palette.danger)
        .lineLimit(1)
    }
}
