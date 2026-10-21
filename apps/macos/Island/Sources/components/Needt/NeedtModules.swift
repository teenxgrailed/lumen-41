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
        case .today: return "Today"
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
                .foregroundStyle(.secondary)
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

@MainActor
struct NeedtFocusTabView: View {
    @ObservedObject var tray: TrayStore
    @ObservedObject var net = Connectivity.shared

    var body: some View {
        let state = tray.state
        VStack(spacing: 10) {
            if state.isFocusActive {
                active(state)
            } else {
                idle(state)
            }
            if let error = tray.focusError {
                Text(error).font(.caption).foregroundStyle(.red)
            }
            NeedtOfflineLine(net: net, updatedAt: tray.updatedAt)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private func active(_ state: TrayState) -> some View {
        Text(state.focusTitle ?? "Focus")
            .font(.system(size: 15, weight: .semibold))
            .lineLimit(1)
        if let end = state.focusEndDate, end > Date(), !tray.isFocusPaused {
            Text(timerInterval: Date()...end, countsDown: true)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
        } else {
            Text(tray.isFocusPaused ? "Paused" : (state.focus ?? "Focus"))
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        HStack(spacing: 10) {
            Button(tray.isFocusPaused ? "Resume" : "Pause") { tray.togglePauseFocus() }
                .buttonStyle(NeedtIslandButtonStyle())
            TimelineView(.periodic(from: Date(), by: 20)) { context in
                Button(doneLabel(state, at: context.date)) { tray.endFocus() }
                    .buttonStyle(NeedtIslandButtonStyle(prominent: true))
            }
        }
        .disabled(!net.isOnline)
    }

    private func doneLabel(_ state: TrayState, at date: Date) -> String {
        guard let left = state.focusSecondsLeft(at: date), left > 60 else { return "Done" }
        return "Done \((left + 59) / 60) min early"
    }

    @ViewBuilder
    private func idle(_ state: TrayState) -> some View {
        Text("No focus running")
            .font(.system(size: 15, weight: .semibold))
        if let next = state.next.first {
            Text(next.title)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Button("Start focus") { tray.startFocusOnNextTask() }
                .buttonStyle(NeedtIslandButtonStyle(prominent: true))
                .disabled(!net.isOnline)
        }
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
