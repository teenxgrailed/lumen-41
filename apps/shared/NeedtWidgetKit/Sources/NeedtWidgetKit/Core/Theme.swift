import SwiftUI
import WidgetKit

// Tokens and the render context every widget view reads. The context is one
// value built by the entry view from the environment (colour scheme, rendering
// mode, family) so the views themselves stay pure and render the same in a
// widget, a Live Activity preview and a CI snapshot.

/// The widget sizes the design uses. Independent of `WidgetFamily` so a view
/// can also be drawn outside a widget (snapshots, the Settings preview).
public enum NeedtFamily: String, CaseIterable, Sendable {
    case small, medium, large, extraLarge
    case circular, rectangular, inline
    case control

    /// Points at the 393 x 852 iPhone class (docs/port/widget-design-brief.md 1.2).
    /// Mac sizes are [unverified]: Apple publishes no table.
    public var size: CGSize {
        switch self {
        case .small: return CGSize(width: 158, height: 158)
        case .medium: return CGSize(width: 338, height: 158)
        case .large: return CGSize(width: 338, height: 354)
        case .extraLarge: return CGSize(width: 715, height: 338)
        case .circular: return CGSize(width: 72, height: 72)
        case .rectangular: return CGSize(width: 160, height: 72)
        case .inline: return CGSize(width: 234, height: 26)
        case .control: return CGSize(width: 76, height: 76)
        }
    }

    public var isAccessory: Bool { self == .circular || self == .rectangular || self == .inline }
    public var isSystem: Bool { !isAccessory && self != .control }

    init(_ family: WidgetFamily) {
        switch family {
        case .systemSmall: self = .small
        case .systemMedium: self = .medium
        case .systemLarge: self = .large
        case .systemExtraLarge: self = .extraLarge
        #if os(iOS)
        case .accessoryCircular: self = .circular
        case .accessoryRectangular: self = .rectangular
        case .accessoryInline: self = .inline
        #endif
        @unknown default: self = .small
        }
    }
}

extension Color {
    /// "#rrggbb" or "rrggbb"; nil when it is not a colour.
    init?(hex: String?) {
        guard var text = hex?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }

    init(rgb value: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
                  blue: Double(value & 0xFF) / 255, opacity: opacity)
    }
}

/// D · Ink's colours. Every grey is one ink at a ladder alpha (Needt rule);
/// only vibrant mode replaces the alphas with opaque greys.
public struct InkPalette: Equatable, Sendable {
    public var ink: Color
    public var bg: Color
    public var card: Color
    public var accent: Color
    public var a2: Color
    public var a3: Color
    public var line: Color
    public var well: Color
    public var placeholder: Color
    public var checkBorder: Color
    public var danger: Color
    public var isMonochrome: Bool

    public static let accentLight = Color(rgb: 0x6A5CFF)

    public static func make(scheme: ColorScheme, mode: WidgetRenderingMode) -> InkPalette {
        switch mode {
        case .vibrant:
            // Opaque greys: opacity of pixels is the strength of the blur.
            return InkPalette(
                ink: .white, bg: .clear, card: Color.white.opacity(0.0), accent: .white,
                a2: Color(rgb: 0xC9C9D0), a3: Color(rgb: 0x9C9CA6), line: Color(rgb: 0x5C5C66),
                well: Color(rgb: 0x2A2A30), placeholder: Color(rgb: 0x5C5C66), checkBorder: Color(rgb: 0x9C9CA6),
                danger: .white, isMonochrome: true
            )
        case .accented:
            // The system tints both groups white; hierarchy is alpha and weight.
            return InkPalette(
                ink: .white, bg: .clear, card: Color.white.opacity(0.10), accent: .white,
                a2: Color.white.opacity(0.58), a3: Color.white.opacity(0.38), line: Color.white.opacity(0.18),
                well: Color.white.opacity(0.10), placeholder: Color.white.opacity(0.2),
                checkBorder: Color.white.opacity(0.5), danger: .white, isMonochrome: true
            )
        default:
            let dark = scheme == .dark
            let ink = dark ? Color(rgb: 0xF3F1FF) : Color(rgb: 0x17162B)
            return InkPalette(
                ink: ink, bg: dark ? Color(rgb: 0x1A1926) : Color(rgb: 0xFBFBFD),
                card: dark ? Color(rgb: 0x24232F) : Color(rgb: 0xFBFBFD), accent: accentLight,
                a2: ink.opacity(0.58), a3: ink.opacity(0.38), line: ink.opacity(0.09),
                well: ink.opacity(0.05), placeholder: ink.opacity(0.12), checkBorder: ink.opacity(0.30),
                danger: Color(rgb: 0xE5484D), isMonochrome: false
            )
        }
    }
}

/// A font face: a bundled family, or a system design as the fallback.
public struct FontSpec: Sendable {
    public var name: String?
    public var design: Font.Design
    public var italic: Bool

    public init(name: String? = nil, design: Font.Design = .default, italic: Bool = false) {
        self.name = name
        self.design = design
        self.italic = italic
    }

    /// 12 and 13 follow Dynamic Type (caption / footnote at the default size);
    /// bigger sizes are glance numerals and stay fixed.
    public func font(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        var base: Font
        if let name, StyleFonts.isAvailable(name) {
            base = Font.custom(name, size: size, relativeTo: size <= 12 ? .caption : size <= 13 ? .footnote : .body)
            if weight != .regular { base = base.weight(weight) }
        } else if size == 13 {
            base = .system(.footnote, design: design, weight: weight)
        } else if size == 12 {
            base = .system(.caption, design: design, weight: weight)
        } else {
            base = .system(size: size, weight: weight, design: design)
        }
        return italic ? base.italic() : base
    }
}

/// Each style's type: titles and labels at 13 / 12, one display face for the
/// big numerals. D · Ink's display face is Exposure (a trial font that is not
/// shipped); New York is the stand-in [unverified].
public struct StyleFonts: Sendable {
    public var body: FontSpec
    public var display: FontSpec
    public var mono: FontSpec

    public static let ink = StyleFonts(
        body: FontSpec(), display: FontSpec(design: .serif), mono: FontSpec(design: .monospaced)
    )

    /// True when a family registered from the package's `Fonts` resources (or
    /// installed) can be found; otherwise `Font.custom` would silently fall back.
    static func isAvailable(_ name: String) -> Bool {
        FontRegistry.registerIfNeeded()
        return FontRegistry.names.contains(name)
    }

    public func t13(_ weight: Font.Weight = .regular) -> Font { body.font(13, weight: weight) }
    public func t12(_ weight: Font.Weight = .regular) -> Font { body.font(12, weight: weight) }
    public func num(_ size: CGFloat) -> Font { display.font(size) }
}

/// Everything a widget view needs to draw itself.
public struct RenderContext: Sendable {
    public var scheme: ColorScheme
    public var mode: WidgetRenderingMode
    public var family: NeedtFamily
    public var now: Date
    /// "Show titles on Lock Screen" (default off): without it, titles are
    /// marked privacySensitive and redact while the device is locked.
    public var showTitles: Bool
    /// True while a CI snapshot is rendered: countdowns draw static so the
    /// image is deterministic and `ProgressView(timerInterval:)` is not needed.
    public var isSnapshot: Bool
    public var fonts: StyleFonts
    public var palette: InkPalette
    public var calendar: Calendar
    /// What the person chose in the Edit menu (layout alternatives).
    public var choices = WidgetChoices()

    public init(scheme: ColorScheme = .light, mode: WidgetRenderingMode = .fullColor, family: NeedtFamily,
                now: Date = Date(), showTitles: Bool = false, isSnapshot: Bool = false,
                fonts: StyleFonts = .ink, calendar: Calendar = .current) {
        self.scheme = scheme
        self.mode = mode
        self.family = family
        self.now = now
        self.showTitles = showTitles
        self.isSnapshot = isSnapshot
        self.fonts = fonts
        self.calendar = calendar
        self.palette = InkPalette.make(scheme: scheme, mode: mode)
    }

    public var isFullColor: Bool { mode == .fullColor }
    public var isDark: Bool { scheme == .dark }
}

private struct RenderContextKey: EnvironmentKey {
    static let defaultValue = RenderContext(family: .small)
}

extension EnvironmentValues {
    var needt: RenderContext {
        get { self[RenderContextKey.self] }
        set { self[RenderContextKey.self] = newValue }
    }
}
