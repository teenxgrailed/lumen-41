import Defaults
import NeedtKit
import SwiftUI

// The Needt modules of the island: the focus run, what is next today, and
// quick add. They read the same state the menu bar shows (TrayStore) and write
// through the same HTTP API (NeedtAPI); no route is added for them.

/// One Needt module on the island. Raw values are stored in Defaults.
enum NeedtModule: String, CaseIterable, Codable, Identifiable, Defaults.Serializable {
    case focus
    case today
    case quickAdd

    var id: String { rawValue }

    var title: String {
        switch self {
        case .focus: return "Focus"
        case .today: return "Next"
        case .quickAdd: return "Add"
        }
    }

    var icon: String {
        switch self {
        case .focus: return "scope"
        case .today: return "checklist"
        case .quickAdd: return "plus.circle"
        }
    }

    var notchView: NotchViews {
        switch self {
        case .focus: return .needtFocus
        case .today: return .needtToday
        case .quickAdd: return .needtAdd
        }
    }

    static func module(for view: NotchViews) -> NeedtModule? {
        allCases.first { $0.notchView == view }
    }

    var isEnabled: Bool { Defaults[.needtModulesEnabled].contains(self) }
}

extension Defaults.Keys {
    /// Needt modules shown on the island, in tab order (first is the landing tab).
    static let needtModuleOrder = Key<[NeedtModule]>("needtModuleOrder", default: NeedtModule.allCases)
    /// Which of them are switched on.
    static let needtModulesEnabled = Key<[NeedtModule]>("needtModulesEnabled", default: NeedtModule.allCases)
    /// The first-run screen is shown once.
    static let needtIntroSeen = Key<Bool>("needtIntroSeen", default: false)
}

extension NeedtModule {
    /// The modules to show as tabs: enabled ones, in the chosen order.
    static var visible: [NeedtModule] {
        let order = Defaults[.needtModuleOrder]
        let rest = allCases.filter { !order.contains($0) }
        return (order + rest).filter { $0.isEnabled }
    }
}

extension NotchViews {
    /// Where the island lands when it opens: the first Needt module, else Home.
    static var landing: NotchViews {
        NeedtModule.visible.first?.notchView ?? .home
    }

    var isNeedtModule: Bool { NeedtModule.module(for: self) != nil }
}

// MARK: - Shared pieces

/// "Offline · updated HH:mm" when the network is gone; nothing otherwise.
@MainActor
private struct NeedtOfflineLine: View {
    @ObservedObject var net: Connectivity
    let updatedAt: Date?

    var body: some View {
        if !net.isOnline {
            Text(updatedAt.map { "Offline · updated \(Self.clock.string(from: $0))" } ?? "Offline")
                .font(.caption)
                .foregroundStyle(NeedtInk.secondary)
        }
    }

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()
}

private struct NeedtIslandButtonStyle: ButtonStyle {
    var prominent = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(prominent ? Color.white.opacity(0.9) : Color.white.opacity(0.14))
            )
            .foregroundStyle(prominent ? Color.black : Color.white)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

// MARK: - Focus

/// Greys are white at a fixed ladder of alphas; no accent fills.
enum NeedtInk {
    static let primary = Color.white
    static let secondary = Color.white.opacity(0.6)
    static let tertiary = Color.white.opacity(0.38)
    static let card = Color.white.opacity(0.07)
    static let pill = Color.white.opacity(0.14)
    static let track = Color.white.opacity(0.14)
}

private struct NeedtPillStyle: ButtonStyle {
    var light = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 14)
            .frame(height: 30)
            .background(Capsule().fill(light ? Color.white : NeedtInk.pill))
            .foregroundStyle(light ? Color.black : NeedtInk.primary)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

@MainActor
struct NeedtFocusTabView: View {
    @ObservedObject var tray: TrayStore
    @ObservedObject var net = Connectivity.shared
    @State private var session: FocusSession?

    var body: some View {
        let state = tray.state
        VStack(spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                focusCard(state)
                upNextCard(state)
            }
            if let error = tray.focusError {
                Text(error).font(.system(size: 12)).foregroundStyle(NeedtInk.secondary)
            }
            NeedtOfflineLine(net: net, updatedAt: tray.updatedAt)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: state.focusEndsAt) { await loadSession(state) }
    }

    private func loadSession(_ state: TrayState) async {
        guard state.isFocusActive else { session = nil; return }
        session = try? await tray.api.activeFocusSession()
    }

    // MARK: left card

    private func focusCard(_ state: TrayState) -> some View {
        HStack(spacing: 14) {
            ring(state)
            VStack(alignment: .leading, spacing: 4) {
                if state.isFocusActive {
                    Text(session?.plannedMinutes.map { "Focus · \($0) min" } ?? "Focus")
                        .font(.system(size: 12))
                        .foregroundStyle(NeedtInk.secondary)
                    Text(state.focusTitle ?? "Focus")
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(2)
                    Spacer(minLength: 4)
                    HStack(spacing: 8) {
                        Button(tray.isFocusPaused ? "Resume" : "Pause") { tray.togglePauseFocus() }
                            .buttonStyle(NeedtPillStyle())
                        TimelineView(.periodic(from: Date(), by: 20)) { context in
                            Button {
                                tray.endFocus()
                            } label: {
                                Label(doneLabel(state, at: context.date), systemImage: "checkmark")
                            }
                            .buttonStyle(NeedtPillStyle(light: true))
                        }
                    }
                    .disabled(!net.isOnline)
                } else {
                    Text("No focus running")
                        .font(.system(size: 14, weight: .semibold))
                    if let next = state.next.first {
                        Text(next.title)
                            .font(.system(size: 12))
                            .foregroundStyle(NeedtInk.secondary)
                            .lineLimit(2)
                        Spacer(minLength: 4)
                        Button("Start focus") { tray.startFocusOnNextTask() }
                            .buttonStyle(NeedtPillStyle(light: true))
                            .disabled(!net.isOnline)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, maxHeight: 150, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(NeedtInk.card))
    }

    private func ring(_ state: TrayState) -> some View {
        TimelineView(.animation(minimumInterval: 1)) { context in
            let fraction = progress(state, at: context.date)
            ZStack {
                Circle().stroke(NeedtInk.track, lineWidth: 6)
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(NeedtInk.primary, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                clock(state)
            }
        }
        .frame(width: 96, height: 96)
    }

    @ViewBuilder
    private func clock(_ state: TrayState) -> some View {
        if let end = state.focusEndDate, end > Date(), !tray.isFocusPaused {
            Text(timerInterval: Date()...end, countsDown: true, showsHours: false)
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.center)
                .frame(width: 70)
        } else if tray.isFocusPaused {
            Image(systemName: "pause.fill").font(.system(size: 18)).foregroundStyle(NeedtInk.secondary)
        } else {
            Text("--:--")
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(NeedtInk.tertiary)
        }
    }

    /// Share of the run that is left, from the session when known.
    private func progress(_ state: TrayState, at date: Date) -> Double {
        guard state.isFocusActive else { return 0 }
        guard let planned = session?.plannedMinutes, planned > 0 else { return 1 }
        let left = state.focusSecondsLeft(at: date) ?? session?.secondsLeft(at: date) ?? 0
        return min(1, max(0, Double(left) / Double(planned * 60)))
    }

    private func doneLabel(_ state: TrayState, at date: Date) -> String {
        guard let left = state.focusSecondsLeft(at: date), left > 60 else { return "Done" }
        return "Done \((left + 59) / 60) min early"
    }

    // MARK: right card

    private func upNextCard(_ state: TrayState) -> some View {
        let candidates = state.next.filter { $0.title != state.focusTitle }
        let next = candidates.first ?? (state.isFocusActive ? nil : state.next.dropFirst().first)
        return VStack(alignment: .leading, spacing: 4) {
            Text("Up next")
                .font(.system(size: 12))
                .foregroundStyle(NeedtInk.secondary)
            if let next {
                Text(next.title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(2)
                if let time = next.time {
                    Text(time)
                        .font(.system(size: 12))
                        .foregroundStyle(NeedtInk.secondary)
                }
            } else {
                Text("Nothing else today")
                    .font(.system(size: 13))
                    .foregroundStyle(NeedtInk.secondary)
            }
            Spacer(minLength: 4)
            Text("Done early? Needt gives the time back to your day.")
                .font(.system(size: 12))
                .foregroundStyle(NeedtInk.tertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, maxHeight: 150, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(NeedtInk.card))
    }
}

// MARK: - Today (next task and next event)

@MainActor
struct NeedtTodayTabView: View {
    @ObservedObject var tray: TrayStore
    @ObservedObject var net = Connectivity.shared
    @ObservedObject private var calendar = CalendarManager.shared

    private var nextEvent: EventModel? {
        let now = Date()
        return calendar.events
            .filter { $0.type.isEvent && !$0.isAllDay && $0.end > now }
            .min { $0.start < $1.start }
    }

    var body: some View {
        let state = tray.state
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 16) {
                card(title: "Next task", icon: "checklist") {
                    if let task = state.next.first {
                        Text(task.title).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                        if let time = task.time {
                            Text(time).font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                    } else {
                        Text("Nothing planned").font(.system(size: 13)).foregroundStyle(.secondary)
                    }
                }
                card(title: "Next event", icon: "calendar") {
                    if let event = nextEvent {
                        Text(event.title).font(.system(size: 14, weight: .semibold)).lineLimit(2)
                        Text(event.start, style: .time).font(.system(size: 12)).foregroundStyle(.secondary)
                    } else {
                        Text("No more events today").font(.system(size: 13)).foregroundStyle(.secondary)
                    }
                }
            }
            HStack(spacing: 10) {
                if state.open > 0 {
                    Text("\(state.open) open").font(.caption).foregroundStyle(.secondary)
                }
                if state.overdue > 0 {
                    Text("\(state.overdue) overdue").font(.caption).foregroundStyle(.red)
                }
                Spacer()
                NeedtOfflineLine(net: net, updatedAt: tray.updatedAt)
            }
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private func card<Content: View>(title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: icon)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.08)))
    }
}

// MARK: - Quick add

@MainActor
struct NeedtQuickAddTabView: View {
    @ObservedObject var tray: TrayStore
    @ObservedObject var net = Connectivity.shared
    @State private var text = ""
    @State private var sending = false
    @State private var message: String?

    var body: some View {
        VStack(spacing: 10) {
            TextField("Add a task", text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 15))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.1)))
                .onSubmit(add)
                .disabled(!net.isOnline || sending)
            if let message {
                Text(message).font(.caption).foregroundStyle(.secondary)
            }
            NeedtOfflineLine(net: net, updatedAt: tray.updatedAt)
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func add() {
        let title = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, net.isOnline, !sending else { return }
        sending = true
        Task {
            do {
                _ = try await tray.api.createTask(NeedtAPI.NewTask(title: title))
                text = ""
                message = "Added"
            } catch {
                message = (error as? NeedtAPIError)?.message ?? "Could not reach Needt"
            }
            sending = false
        }
    }
}

// MARK: - First run

/// Shown once, the first time the island opens.
@MainActor
struct NeedtIntroView: View {
    @Default(.needtModulesEnabled) private var enabled
    @Default(.needtIntroSeen) private var seen

    var body: some View {
        HStack(spacing: 24) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    ZStack {
                        Circle().stroke(NeedtInk.track, lineWidth: 3)
                        Circle().trim(from: 0, to: 0.7)
                            .stroke(NeedtInk.primary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                    }
                    .frame(width: 18, height: 18)
                    Text("Focus 18:04")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                }
                .padding(.horizontal, 14)
                .frame(height: 34)
                .background(Capsule().fill(Color.black))
                .overlay(Capsule().stroke(NeedtInk.track, lineWidth: 1))
            }
            .frame(width: 190)

            VStack(alignment: .leading, spacing: 8) {
                Text("Meet the island")
                    .font(.system(size: 17, weight: .semibold))
                Text("Your focus, next task and quick add live in the notch. Hover to peek, click to open.")
                    .font(.system(size: 13))
                    .foregroundStyle(NeedtInk.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                toggle("Focus timer", .focus)
                toggle("Next task & event", .today)
                toggle("Quick add", .quickAdd)
                Button("Got it") { seen = true }
                    .buttonStyle(NeedtPillStyle(light: true))
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func toggle(_ title: String, _ module: NeedtModule) -> some View {
        Toggle(title, isOn: Binding(
            get: { enabled.contains(module) },
            set: { on in
                enabled.removeAll { $0 == module }
                if on { enabled.append(module) }
            }
        ))
        .toggleStyle(.switch)
        .controlSize(.small)
        .font(.system(size: 13))
    }
}

// MARK: - Closed island while a focus runs

/// The notch grows sideways: a progress ring on the left, the time on the right.
@MainActor
struct NeedtFocusLiveActivity: View {
    @EnvironmentObject var vm: DynamicIslandViewModel
    @ObservedObject var tray: TrayStore
    @State private var session: FocusSession?

    private var height: CGFloat { max(0, vm.effectiveClosedNotchHeight - 12) }

    var body: some View {
        let state = tray.state
        HStack(spacing: 0) {
            Color.clear
                .frame(width: height + 20, height: height)
                .overlay(alignment: .trailing) {
                    TimelineView(.animation(minimumInterval: 1)) { context in
                        ZStack {
                            Circle().stroke(NeedtInk.track, lineWidth: 2.5)
                            Circle()
                                .trim(from: 0, to: progress(state, at: context.date))
                                .stroke(NeedtInk.primary, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                        .frame(width: height - 8, height: height - 8)
                    }
                }
            Rectangle()
                .fill(.black)
                .frame(width: vm.closedNotchSize.width, height: height)
            Color.clear
                .frame(width: 76, height: height)
                .overlay(alignment: .leading) {
                    if let end = state.focusEndDate, end > Date(), !tray.isFocusPaused {
                        Text(timerInterval: Date()...end, countsDown: true, showsHours: false)
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(NeedtInk.primary)
                            .frame(width: 60, alignment: .leading)
                    } else {
                        Image(systemName: "pause.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(NeedtInk.secondary)
                    }
                }
        }
        .frame(height: vm.effectiveClosedNotchHeight, alignment: .center)
        .task(id: state.focusEndsAt) {
            session = state.isFocusActive ? (try? await tray.api.activeFocusSession()) : nil
        }
    }

    private func progress(_ state: TrayState, at date: Date) -> Double {
        guard let planned = session?.plannedMinutes, planned > 0 else { return 1 }
        let left = state.focusSecondsLeft(at: date) ?? session?.secondsLeft(at: date) ?? 0
        return min(1, max(0, Double(left) / Double(planned * 60)))
    }
}
