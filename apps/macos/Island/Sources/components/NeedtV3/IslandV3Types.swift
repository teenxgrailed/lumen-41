import AppKit
import NeedtKit
import SwiftUI

// Island v3 (additions-2/widgets/island3.*). One black shape that morphs; the
// states, shapes and numbers below are the table in CLAUDE-CODE-PROMPT.md,
// "Notch island v3". Geometry comes from the screen (see IslandV3Metrics),
// never from a model number.

/// Every state the one shape can take. The raw names match the `m-*` classes
/// of the HTML lab.
enum IslandV3Mode: String, CaseIterable, Identifiable {
    case idle, override, live, warn, standby, go, drop, dropped, peek, open
    case done, music, airpods, charge, hudv

    var id: String { rawValue }

    /// A moment: a short system event in the closed island (about 3 s).
    var isMoment: Bool {
        switch self {
        case .done, .music, .airpods, .charge, .hudv: return true
        default: return false
        }
    }

    /// Modes the island rests in; everything else returns to one of these.
    var isResting: Bool {
        switch self {
        case .idle, .override, .live, .warn: return true
        default: return false
        }
    }

    /// Open, close and the press use a critically damped curve. Only passive
    /// changes (live, warning, moments) keep the soft spring.
    var isCalm: Bool { self == .open }
}

enum IslandV3Tab: String, CaseIterable, Identifiable {
    case today, week, focus, more, module
    var id: String { rawValue }

    /// Order for "slide in the direction of travel".
    var order: Int {
        switch self {
        case .today: return 0
        case .week: return 1
        case .focus: return 2
        case .more: return 3
        case .module: return 4
        }
    }
}

/// What the screen says about itself. Notch width and bar height are read from
/// `safeAreaInsets` and the two auxiliary top areas; a screen without them
/// gets a centred pill.
struct IslandV3Metrics: Equatable {
    var hasNotch: Bool
    /// Width of the camera housing (the gap between the two menu-bar halves).
    var notchWidth: CGFloat
    /// Height of the menu-bar band the notch occupies.
    var barHeight: CGFloat

    /// What the lab draws for a notchless screen.
    static let pill = IslandV3Metrics(hasNotch: false, notchWidth: 186, barHeight: 32)
    /// A neutral notch for previews and tests only; never used to place a window.
    static let previewNotch = IslandV3Metrics(hasNotch: true, notchWidth: 186, barHeight: 32)

    @MainActor
    static func measure(_ screen: NSScreen) -> IslandV3Metrics {
        let top = screen.safeAreaInsets.top
        if top > 0, let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
            let width = screen.frame.width - left.width - right.width
            if width > 0 {
                return IslandV3Metrics(hasNotch: true, notchWidth: width.rounded(), barHeight: top)
            }
        }
        return .pill
    }
}

/// Width x height and bottom corner radius of the shape in one state.
struct IslandV3Size: Equatable {
    var width: CGFloat
    var height: CGFloat
    var radius: CGFloat
}

enum IslandV3Geometry {
    /// Heights of the open shape by tab (lab `OPEN_H`), measured on a 32 pt bar.
    static func openHeight(tab: IslandV3Tab, module: IslandModuleID?) -> CGFloat {
        switch tab {
        case .today: return 318
        case .week: return 262
        case .focus: return 250
        case .more: return 228
        case .module: return module == .cal ? 300 : 268
        }
    }

    /// Room each closed state needs in one ear (left or right of the notch).
    /// With a notch, content may not sit under the camera housing, so the
    /// width is at least the notch plus two ears; without one the table value
    /// is used as is.
    private static func ear(for mode: IslandV3Mode) -> CGFloat {
        switch mode {
        case .live: return 98
        case .warn: return 200
        case .done: return 112
        case .music: return 62
        case .airpods, .charge: return 112
        case .hudv: return 100
        default: return 0
        }
    }

    static func size(mode: IslandV3Mode, tab: IslandV3Tab, module: IslandModuleID?, metrics m: IslandV3Metrics) -> IslandV3Size {
        let bar = m.barHeight
        let extra = bar - 32  // the table is drawn on a 32 pt bar
        func closed(_ w: CGFloat, _ r: CGFloat) -> IslandV3Size {
            let width = m.hasNotch ? max(w, m.notchWidth + 2 * ear(for: mode)) : w
            return IslandV3Size(width: width, height: bar, radius: r)
        }
        switch mode {
        case .idle:
            return IslandV3Size(width: m.hasNotch ? m.notchWidth : 186, height: bar, radius: 10)
        case .override:
            return IslandV3Size(width: (m.hasNotch ? m.notchWidth : 186) + 46, height: bar, radius: 12)
        case .live: return closed(312, 13)
        case .warn: return closed(430, 15)
        case .standby, .go: return IslandV3Size(width: 480, height: bar + 88, radius: 26)
        case .drop, .dropped: return IslandV3Size(width: 340, height: 64 + extra, radius: 22)
        case .peek: return IslandV3Size(width: 480, height: bar + 108, radius: 30)
        case .open:
            return IslandV3Size(width: 680, height: openHeight(tab: tab, module: module) + extra, radius: 36)
        case .done: return closed(440, 15)
        case .music: return closed(312, 13)
        case .airpods, .charge: return closed(360, 14)
        case .hudv: return closed(340, 14)
        }
    }
}

// MARK: - Palette (content colours; the accent is only ever a mark)

enum IslandV3Palette {
    /// Area colours of the lab (`AREA`).
    static let area: [Color] = [
        Color(red: 0.490, green: 0.420, blue: 1.000),  // work   #7d6bff
        Color(red: 1.000, green: 0.353, blue: 0.373),  // fit    #ff5a5f
        Color(red: 1.000, green: 0.690, blue: 0.125),  // home   #ffb020
        Color(red: 0.184, green: 0.710, blue: 1.000),  // lang   #2fb5ff
        Color(red: 1.000, green: 0.541, blue: 0.239)   // side   #ff8a3d
    ]

    /// The server sends no area colour with a task; the project picks one,
    /// stably. [unverified] mapping: it only has to be consistent.
    static func color(forProject id: String?) -> Color {
        guard let id, !id.isEmpty else { return Color.white.opacity(0.4) }
        var h: UInt32 = 5381
        for u in id.unicodeScalars { h = (h &* 33) &+ u.value }
        return area[Int(h % UInt32(area.count))]
    }

    static let green = Color(red: 0.188, green: 0.820, blue: 0.345)   // #30d158
    static let yellow = Color(red: 1.0, green: 0.839, blue: 0.039)    // #ffd60a
    static let red = Color(red: 1.0, green: 0.271, blue: 0.227)       // #ff453a
    static let accent = Color(nsColor: .controlAccentColor)

    /// The module tile colours.
    static func tint(_ id: IslandModuleID) -> Color {
        switch id {
        case .music: return Color(red: 1.0, green: 0.216, blue: 0.373)   // #ff375f
        case .cal: return red
        case .shelf: return Color(red: 1.0, green: 0.624, blue: 0.039)   // #ff9f0a
        case .clip: return Color(red: 0.557, green: 0.557, blue: 0.576)  // #8e8e93
        case .dev: return green
        case .tools: return Color(red: 0.039, green: 0.518, blue: 1.0)   // #0a84ff
        case .hud: return Color(red: 0.388, green: 0.388, blue: 0.4)     // #636366
        }
    }
}

extension IslandModuleID {
    var title: String {
        switch self {
        case .music: return "Music"
        case .cal: return "Calendar"
        case .shelf: return "Shelf"
        case .clip: return "Clipboard"
        case .dev: return "Devices"
        case .tools: return "Tools"
        case .hud: return "HUD"
        }
    }

    /// The SF Symbols of the design table.
    var symbol: String {
        switch self {
        case .music: return "music.note"
        case .cal: return "calendar"
        case .shelf: return "tray.full"
        case .clip: return "doc.on.clipboard"
        case .dev: return "battery.75percent"
        case .tools: return "wrench.and.screwdriver"
        case .hud: return "speaker.wave.2"
        }
    }

    /// Whether this build ships the module. The HUD needs the system volume
    /// and the media-key path, so it is a direct-download feature.
    var isAvailable: Bool {
        #if APPSTORE
        return self != .hud
        #else
        return true
        #endif
    }
}

// MARK: - Data the views draw

struct IslandV3Row: Identifiable, Equatable {
    var id: String
    var title: String
    var time: String
    var color: Color
}

struct IslandV3Next: Equatable {
    var id: String?
    var title: String
    var shortTitle: String
    /// "15:00", or "tomorrow".
    var timeLabel: String
    var minutes: Int?
}

/// Everything the closed and open layers show. Views read this and nothing
/// else, so the CI renderer can draw every state from fixtures.
struct IslandV3Data: Equatable {
    var focusTitle = "Deep work on the main project"
    var focusShort = "Deep work"
    var focusEnd: Date?
    var focusTotal: TimeInterval = 25 * 60
    var focusPaused = false
    var next: IslandV3Next?
    var rows: [IslandV3Row] = []
    var leftCount = 0
    var freeLabel = ""
    var week: [IslandWeekDay] = []
    var weekPlannedLabel = "0 h"
    var weekFreeLabel = ""
    var override: IslandOverride?
    var music = IslandV3Music()
    var airpodsName = "AirPods Pro"
    var chargePercent = 64
    var volume: Double = 0.64
    var earlyMinutes = 12
    var dropText = "Drop to Shelf"
    var offline = false

    var isFocusRunning: Bool { focusEnd != nil || focusPaused }

    func secondsLeft(at now: Date) -> Int {
        guard let end = focusEnd else { return 0 }
        return max(0, Int(end.timeIntervalSince(now).rounded(.up)))
    }

    func progress(at now: Date) -> Double {
        guard focusTotal > 0, let end = focusEnd else { return 0 }
        let left = max(0, end.timeIntervalSince(now))
        return min(1, max(0, 1 - left / focusTotal))
    }
}

struct IslandV3Music: Equatable {
    var title = ""
    var artist = ""
    var isPlaying = false
    var art: NSImage?

    static func == (lhs: IslandV3Music, rhs: IslandV3Music) -> Bool {
        lhs.title == rhs.title && lhs.artist == rhs.artist && lhs.isPlaying == rhs.isPlaying && lhs.art === rhs.art
    }
}
