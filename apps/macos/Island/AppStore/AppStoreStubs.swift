#if APPSTORE
import AppKit
import Combine
import Defaults
import SwiftUI

// The Mac App Store build of the island.
//
// The island's sources use private or restricted system interfaces for a few
// features: window-server spaces (SkyLight), the volume and brightness HUD
// (DisplayServices, CoreBrightness, media-key event taps), CPU and GPU sensors
// (IOReport, SMC), Accessibility-driven scraping, Focus and Bluetooth internals,
// and a private SwiftUI symbol. Those files are not compiled into
// NeedtAppStore (see the excludes in apps/macos/project.yml). This file gives
// the rest of the island inert stand-ins with the same names, so the feature
// simply does nothing here. Nothing in this file calls a private interface.

// MARK: window server

final class WindowLayerBridge {
    static let shared = WindowLayerBridge()
    private init() {}
    func attach(_ window: NSWindow, retries: Int = 20) {}
}

final class NotchWindowSet {
    var windows: Set<NSWindow> = []
}

// MARK: volume, brightness, keyboard backlight (HUD)

extension Notification.Name {
    static let systemVolumeDidChange = Notification.Name("Needt.systemVolumeDidChange")
    static let systemAudioRouteDidChange = Notification.Name("Needt.systemAudioRouteDidChange")
}

final class SystemVolumeController {
    static let shared = SystemVolumeController()
    private init() {}
    var currentVolume: Float = 0
    var isMuted = false
    func start() {}
    func setVolume(_ value: Float) {}
    func toggleMute() {}
}

final class SystemBrightnessController {
    static let shared = SystemBrightnessController()
    private init() {}
    func setBrightness(_ value: Float) {}
}

final class SystemKeyboardBacklightController {
    static let shared = SystemKeyboardBacklightController()
    private init() {}
    func setLevel(_ value: Float) {}
}

// MARK: Accessibility-driven features

final class SystemTimerBridge {
    static let shared = SystemTimerBridge()
    private init() {}
}

final class FullscreenMediaDetector: ObservableObject {
    static let shared = FullscreenMediaDetector()
    @MainActor @Published private(set) var fullscreenStatus: [String: Bool] = [:]
    private init() {}
}

// MARK: screen recording indicator

final class ScreenRecordingManager: ObservableObject {
    static let shared = ScreenRecordingManager()
    @Published var isRecording = false
    @Published var isMonitoring = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var isRecorderIdle = true
    private init() {}
    func startMonitoring() {}
    func stopMonitoring() {}
}

// MARK: Focus (Do Not Disturb)

final class DoNotDisturbManager: ObservableObject {
    static let shared = DoNotDisturbManager()
    @Published private(set) var isMonitoring = false
    @Published var isDoNotDisturbActive = false
    @Published var currentFocusModeName = ""
    @Published var currentFocusModeIdentifier = ""
    @Published var focusToastTrigger = UUID()
    @Published private(set) var isFocusToastDismissing = false
    private init() {}
    func startMonitoring() {}
    func stopMonitoring() {}
}

enum FocusModeType: String, CaseIterable {
    case doNotDisturb = "com.apple.donotdisturb.mode"
    case work = "com.apple.focus.work"
    case personal = "com.apple.focus.personal"
    case sleep = "com.apple.focus.sleep"
    case driving = "com.apple.focus.driving"
    case fitness = "com.apple.focus.fitness"
    case gaming = "com.apple.focus.gaming"
    case mindfulness = "com.apple.focus.mindfulness"
    case reading = "com.apple.focus.reading"
    case reduceInterruptions = "com.apple.focus.reduce-interruptions"
    case custom = "com.apple.focus.custom"
    case unknown = ""

    var displayName: String { "Focus" }
    var sfSymbol: String { "moon.fill" }
    var internalSymbolName: String? { nil }
    var inactiveSymbol: String { "moon.circle.fill" }
    var accentColor: Color { Color(red: 0.370, green: 0.360, blue: 0.902) }
    var activeIcon: Image { Image(systemName: sfSymbol) }

    func resolvedActiveIcon(usePrivateSymbol: Bool = true) -> Image {
        Image(systemName: sfSymbol)
    }

    static func resolve(identifier: String?, name: String?) -> FocusModeType {
        .doNotDisturb
    }
}

struct DoNotDisturbLiveActivity: View {
    var body: some View { EmptyView() }
}

// MARK: Bluetooth battery and listening mode

final class BluetoothAudioManager: ObservableObject {
    static let shared = BluetoothAudioManager()
    @Published var lastConnectedDevice: BluetoothAudioDevice?
    @Published var connectedDevices: [BluetoothAudioDevice] = []
    private init() {}
    func refreshConnectedDeviceBatteries() {}
    func activeDeviceIconSymbol() -> String? { nil }
}

// MARK: CPU, GPU and memory statistics

final class StatsManager: ObservableObject {
    static let shared = StatsManager()
    private init() {}
    func updateMonitoringState(notchIsOpen: Bool, currentView: String) {}
}

// MARK: Apple Notes sync (needs Automation access to Notes)

@MainActor
final class AppleNotesSyncManager: ObservableObject {
    static let shared = AppleNotesSyncManager()
    @Published private(set) var isSyncing = false
    @Published private(set) var lastError: String?
    private init() {}
    func requestSync(localNotes: [NoteItem]) {}
    func sync(localNotes: [NoteItem]) async -> [NoteItem]? { nil }
    func pushNote(_ note: NoteItem) async -> NoteItem? { nil }
    func deleteRemoteNote(appleNotesId: String) async {}
}

// MARK: Terminal

struct NotchTerminalView: View {
    var body: some View { EmptyView() }
}

final class TerminalManager: ObservableObject {
    static let shared = TerminalManager()
    private init() {}
    func refreshTerminalAppearanceIfNeeded() {}
    func focusTerminalIfPossible() {}
    func resignTerminalFirstResponderIfNeeded() {}
}

// MARK: Stats and usage views

struct NotchStatsView: View {
    var body: some View { EmptyView() }
}

struct NotchLLMUsageView: View {
    var body: some View { EmptyView() }
}

// MARK: glass material (the direct build uses a private variant setter)

public enum LiquidGlassVariant: Int, CaseIterable, Identifiable, Defaults.Serializable, Sendable {
    case v0 = 0, v1, v2, v3, v4, v5, v6, v7, v8, v9
    case v10, v11, v12, v13, v14, v15, v16, v17, v18, v19

    public var id: Int { rawValue }
    public static let supportedRange = 0...19
    public static var defaultVariant: LiquidGlassVariant { .v11 }

    public static func clamped(_ rawValue: Int) -> LiquidGlassVariant {
        let clamped = min(max(rawValue, supportedRange.lowerBound), supportedRange.upperBound)
        return LiquidGlassVariant(rawValue: clamped) ?? .defaultVariant
    }
}

public struct LiquidGlassBackground<Content: View>: View {
    private let content: Content
    private let cornerRadius: CGFloat

    public init(
        variant: LiquidGlassVariant = .defaultVariant,
        cornerRadius: CGFloat = 10,
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    public var body: some View {
        content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
#endif
