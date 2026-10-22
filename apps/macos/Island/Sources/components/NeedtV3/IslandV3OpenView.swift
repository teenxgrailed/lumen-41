import AppKit
import NeedtKit
import SwiftUI

/// Open: the bar (Needt mark, Today / Week / Focus, context chip, •••) and the
/// view below it. The tab views slide in the direction of travel.
struct IslandV3OpenView: View {
    @ObservedObject var model: IslandV3Model
    var bar: CGFloat

    var body: some View {
        VStack(spacing: 10) {
            topBar
            ZStack(alignment: .top) {
                content
                    .id(model.tab.rawValue + (model.module?.rawValue ?? ""))
                    .transition(
                        .asymmetric(
                            insertion: AnyTransition.offset(x: model.slide * 28, y: 6).combined(with: .opacity),
                            removal: .opacity
                        )
                    )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .clipped()
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 14)
        .padding(.top, bar + 2)
        .padding(.bottom, 14)
    }

    // MARK: bar

    private var topBar: some View {
        HStack(spacing: 10) {
            IslandV3Mark(size: 18)
            IslandSegmented(
                items: model.prefs.visibleTabs.map { ($0.island, $0.title) },
                selection: Binding(get: { model.tab }, set: { model.select(tab: $0) })
            )
            Spacer(minLength: 8)
            if model.data.music.isPlaying,
               model.prefs.visibleModules.contains(.music) {
                Button { model.openModule(.music) } label: {
                    HStack(spacing: 7) {
                        IslandV3MiniArt(image: model.data.music.art)
                            .clipShape(Circle())
                            .frame(width: 18, height: 18)
                        Text(model.data.music.title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                            .frame(maxWidth: 120)
                        IslandV3EqBars(active: true, count: 3, height: 12)
                    }
                    .padding(.leading, 4).padding(.trailing, 10)
                    .frame(height: 26)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
                .help("Shown while music plays")
            }
            Button {
                model.select(tab: model.tab == .more ? .today : .more)
            } label: {
                Image(systemName: "ellipsis")
            }
            .buttonStyle(IslandCircleButtonStyle(on: model.tab == .more || model.tab == .module))
            .accessibilityLabel("More")
        }
        .frame(height: 26)
    }

    @ViewBuilder
    private var content: some View {
        switch model.tab {
        case .today: IslandV3Today(model: model)
        case .week: IslandV3Week(model: model)
        case .focus: IslandV3FocusTab(model: model)
        case .more: IslandV3MoreGrid(model: model)
        case .module:
            if let id = model.module { IslandV3ModuleHost(model: model, id: id) }
        }
    }
}

private extension IslandPrefs.Tab {
    var island: IslandV3Tab {
        switch self {
        case .today: return .today
        case .week: return .week
        case .focus: return .focus
        }
    }

    var title: String {
        switch self {
        case .today: return "Today"
        case .week: return "Week"
        case .focus: return "Focus"
        }
    }
}

// MARK: - Today

struct IslandV3Today: View {
    @ObservedObject var model: IslandV3Model

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IslandV3Hero(model: model)
                .frame(width: 230)
            IslandV3TaskList(model: model)
        }
    }
}

struct IslandV3Hero: View {
    @ObservedObject var model: IslandV3Model

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let d = model.data
            let running = d.isFocusRunning
            let left = d.secondsLeft(at: context.date)
            VStack(alignment: .leading, spacing: 3) {
                ZStack {
                    IslandRing(
                        progress: running ? d.progress(at: context.date) : 0,
                        size: 66, line: 5, color: .white, track: Color.white.opacity(0.12), comet: running
                    )
                    Text(running ? "\(left / 60)" : "–")
                        .font(.system(size: 19, weight: .semibold)).monospacedDigit()
                }
                .padding(.bottom, 6)
                HStack(spacing: 6) {
                    IslandV3Mark(size: 12)
                    Text(running ? "Focus" : "No focus running")
                    if running && !d.focusPaused {
                        Circle().fill(IslandV3Palette.green).frame(width: 6, height: 6)
                    }
                }
                .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.55))
                Text(running ? d.focusTitle : (d.next?.title ?? "Nothing planned"))
                    .font(.system(size: 14, weight: .semibold)).lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(meta(d, left: left))
                    .font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.55)).monospacedDigit()
                Spacer(minLength: 4)
                HStack(spacing: 8) {
                    if running {
                        Button { model.togglePause() } label: {
                            Label(d.focusPaused ? "Resume" : "Pause", systemImage: d.focusPaused ? "play.fill" : "pause.fill")
                        }
                        .buttonStyle(IslandCapsuleButtonStyle(small: true))
                        Button { model.finishFocus() } label: { Label("Done", systemImage: "checkmark") }
                            .buttonStyle(IslandCapsuleButtonStyle(prominent: true, small: true))
                    } else {
                        Button { model.startFocus(minutes: 25) } label: { Label("Start focus", systemImage: "play.fill") }
                            .buttonStyle(IslandCapsuleButtonStyle(prominent: true, small: true))
                            .disabled(d.next == nil)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                ZStack(alignment: .topTrailing) {
                    LinearGradient(
                        colors: [Color(red: 0.149, green: 0.137, blue: 0.184), Color(red: 0.086, green: 0.082, blue: 0.106)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    // The lavender mark: a soft glow, never a fill.
                    Circle()
                        .fill(RadialGradient(colors: [Color(red: 0.56, green: 0.49, blue: 1).opacity(0.28), .clear], center: .center, startRadius: 0, endRadius: 70))
                        .frame(width: 140, height: 140)
                        .offset(x: 40, y: -40)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.white.opacity(0.06), lineWidth: 0.5))
        }
    }

    private func meta(_ d: IslandV3Data, left: Int) -> String {
        if d.isFocusRunning {
            return "\(IslandV3Format.clock(left)) left" + (d.focusEnd.map { " · ends \(IslandV3Format.time($0))" } ?? "")
        }
        return d.next.map { "\($0.timeLabel)" + ($0.minutes.map { " · \(IslandWeek.hoursLabel($0))" } ?? "") } ?? ""
    }
}

struct IslandV3TaskList: View {
    @ObservedObject var model: IslandV3Model
    @State private var completing: Set<String> = []
    @FocusState private var addFocused: Bool

    var body: some View {
        let d = model.data
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Next").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.8))
                Spacer()
                Text(d.offline ? "Offline" : "\(d.leftCount) left · \(d.freeLabel)")
                    .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
            }
            .padding(.horizontal, 4).padding(.bottom, 6)

            VStack(spacing: 0) {
                ForEach(Array(d.rows.enumerated()), id: \.element.id) { index, row in
                    IslandV3TaskRow(
                        row: row, index: index,
                        isDone: completing.contains(row.id),
                        isNew: model.newRowID == row.id,
                        onDone: {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { _ = completing.insert(row.id) }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.48) { model.complete(row) }
                        },
                        onTrash: { model.trash(row) }
                    )
                    .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 8)), removal: .opacity.combined(with: .offset(x: 20))))
                }
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.85), value: d.rows)

            Spacer(minLength: 0)
            addRow
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var addRow: some View {
        HStack(spacing: 10) {
            switch model.addState {
            case .idle:
                Image(systemName: "plus")
                    .font(.system(size: 9, weight: .bold))
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color.white.opacity(0.12)))
                Text("Add a task").foregroundStyle(Color.white.opacity(0.55))
                Spacer()
                Text("⌥ Space")
                    .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.55))
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 5).fill(Color.white.opacity(0.08)))
            case .typing:
                Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1.6).frame(width: 18, height: 18)
                TextField("What needs doing?", text: $model.addText)
                    .textFieldStyle(.plain)
                    .focused($addFocused)
                    .onSubmit { model.submitAdd() }
                    .onExitCommand { model.cancelAdd() }
                    .onAppear { addFocused = true }
            case .finding:
                Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1.6).frame(width: 18, height: 18)
                Text(model.addText).lineLimit(1)
                Spacer()
                IslandV3Pulse { Text("Needt is finding a slot…").font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.55)) }
            }
        }
        .font(.system(size: 13, weight: .medium))
        .padding(.horizontal, 8)
        .frame(height: 36)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color.white.opacity(model.addState == .idle ? 0 : 0.07)))
        .contentShape(Rectangle())
        .onTapGesture { model.beginAdd() }
    }
}

struct IslandV3Pulse<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @State private var dim = false
    var body: some View {
        content()
            .opacity(dim ? 0.4 : 1)
            .onAppear { withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { dim = true } }
    }
}

struct IslandV3TaskRow: View {
    let row: IslandV3Row
    let index: Int
    let isDone: Bool
    let isNew: Bool
    let onDone: () -> Void
    let onTrash: () -> Void

    @State private var hover = false
    @State private var risenState = false
    @Environment(\.islandStatic) private var isStatic
    private var risen: Bool { risenState || isStatic }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onDone) {
                ZStack {
                    Circle().strokeBorder(row.color, lineWidth: 1.6)
                    if isDone {
                        Circle().fill(row.color)
                        Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(Color.black)
                    } else if hover {
                        Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(row.color.opacity(0.8))
                    }
                }
                .frame(width: 18, height: 18)
                .scaleEffect(isDone ? 1.0 : 1.0)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Complete")
            Text(row.title)
                .font(.system(size: 13, weight: .medium))
                .strikethrough(isDone)
                .foregroundStyle(isDone ? Color.white.opacity(0.4) : Color.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(row.time).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.5)).monospacedDigit()
            Button(action: onTrash) {
                Image(systemName: "trash").font(.system(size: 11))
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
            .buttonStyle(.plain)
            .opacity(hover ? 1 : 0)
            .scaleEffect(hover ? 1 : 0.7)
            .accessibilityLabel("Delete")
        }
        .padding(.horizontal, 8)
        .frame(height: 38)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(isNew ? IslandV3Palette.accent.opacity(0.16) : Color.white.opacity(hover ? 0.07 : 0))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .strokeBorder(IslandV3Palette.accent.opacity(isNew ? 0.5 : 0), lineWidth: 1)
        )
        .opacity(risen ? 1 : 0)
        .offset(y: risen ? 0 : 8)
        .onHover { hover = $0 }
        .animation(.easeOut(duration: 0.15), value: hover)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.8).delay(0.12 + Double(index) * 0.045)) { risenState = true }
        }
    }
}

// MARK: - Week

struct IslandV3Week: View {
    @ObservedObject var model: IslandV3Model
    @State private var grownState = false
    @Environment(\.islandStatic) private var isStatic
    private var grown: Bool { grownState || isStatic }

    private static let names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        let d = model.data
        HStack(spacing: 6) {
            ForEach(Array(d.week.enumerated()), id: \.element.id) { index, day in
                VStack(spacing: 4) {
                    Text(Self.label(day.date)).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5))
                    Text("\(Calendar.current.component(.day, from: day.date))")
                        .font(.system(size: 13, weight: .semibold)).monospacedDigit()
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(day.isToday ? IslandV3Palette.red : .clear))
                    GeometryReader { proxy in
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06))
                            RoundedRectangle(cornerRadius: 6)
                                .fill(LinearGradient(colors: [Color(red: 0.65, green: 0.59, blue: 1), Color(red: 0.42, green: 0.35, blue: 0.94)], startPoint: .top, endPoint: .bottom))
                                .frame(height: grown ? max(day.minutes > 0 ? 4 : 0, proxy.size.height * CGFloat(day.load)) : 0)
                                .animation(.spring(response: 0.6, dampingFraction: 0.8).delay(Double(index) * 0.04), value: grown)
                        }
                    }
                    .frame(width: 22)
                    Text(IslandWeek.hoursLabel(day.minutes))
                        .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5)).monospacedDigit()
                }
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(day.isToday ? 0.12 : 0.06)))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Planned this week").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                Text(d.weekPlannedLabel).font(.system(size: 30, weight: .semibold)).monospacedDigit()
                Text(d.weekFreeLabel).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                Button { model.planWeek() } label: { Label("Plan my week", systemImage: "sparkles") }
                    .buttonStyle(IslandCapsuleButtonStyle(prominent: true, small: true))
                    .padding(.top, 4)
            }
            .frame(width: 160, alignment: .leading)
            .padding(.leading, 8)
        }
        .onAppear { grownState = true }
    }

    private static func label(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return f.string(from: date)
    }
}

// MARK: - Focus

struct IslandV3FocusTab: View {
    @ObservedObject var model: IslandV3Model
    @State private var minutes = 25

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let d = model.data
            let running = d.isFocusRunning
            HStack(spacing: 22) {
                ZStack {
                    IslandRing(
                        progress: running ? d.progress(at: context.date) : 1,
                        size: 88, line: 6,
                        color: Color.white.opacity(0.9), track: Color.white.opacity(0.12), comet: running
                    )
                    Text(running ? IslandV3Format.clock(d.secondsLeft(at: context.date)) : String(format: "%d:00", minutes))
                        .font(.system(size: 22, weight: .semibold)).monospacedDigit()
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text(running ? "Focus" : "Next focus").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                    Text(running ? d.focusTitle : (d.next?.title ?? "Nothing planned"))
                        .font(.system(size: 16, weight: .semibold)).lineLimit(1)
                    if running {
                        HStack(spacing: 8) {
                            Button { model.togglePause() } label: {
                                Label(d.focusPaused ? "Resume" : "Pause", systemImage: d.focusPaused ? "play.fill" : "pause.fill")
                            }
                            .buttonStyle(IslandCapsuleButtonStyle())
                            Button { model.finishFocus() } label: { Label("Done", systemImage: "checkmark") }
                                .buttonStyle(IslandCapsuleButtonStyle(prominent: true))
                        }
                    } else {
                        IslandSegmented(items: [(25, "25 min"), (50, "50 min"), (90, "90 min")], selection: $minutes)
                        HStack(spacing: 8) {
                            Button { model.startFocus(minutes: minutes) } label: { Label("Start focus", systemImage: "play.fill") }
                                .buttonStyle(IslandCapsuleButtonStyle(prominent: true))
                            Button("Pick a task…") { model.select(tab: .today) }
                                .buttonStyle(IslandCapsuleButtonStyle())
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .frame(maxHeight: .infinity)
        }
    }
}

// MARK: - More

struct IslandV3MoreGrid: View {
    @ObservedObject var model: IslandV3Model
    @State private var risenState = false
    @Environment(\.islandStatic) private var isStatic
    private var risen: Bool { risenState || isStatic }

    var body: some View {
        let modules = model.prefs.visibleModules.filter(\.isAvailable)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: max(1, modules.count)), spacing: 8) {
            ForEach(Array(modules.enumerated()), id: \.element) { index, id in
                Button { model.openModule(id) } label: {
                    VStack(spacing: 10) {
                        Image(systemName: id.symbol)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .frame(width: 40, height: 40)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(LinearGradient(colors: [IslandV3Palette.tint(id).opacity(0.9), IslandV3Palette.tint(id)], startPoint: .top, endPoint: .bottom))
                            )
                        Text(id.title).font(.system(size: 12, weight: .medium))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 112)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.white.opacity(0.06)))
                    .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
                .opacity(risen ? 1 : 0)
                .offset(y: risen ? 0 : 6)
                .animation(.spring(response: 0.5, dampingFraction: 0.85).delay(0.06 + Double(index) * 0.045), value: risen)
            }
        }
        .padding(.top, 4)
        .onAppear { risenState = true }
    }
}

/// A module's page: the "‹ More" back button and the module itself.
struct IslandV3ModuleHost: View {
    @ObservedObject var model: IslandV3Model
    let id: IslandModuleID

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { model.backToMore() } label: {
                Label("More", systemImage: "chevron.left")
            }
            .buttonStyle(IslandCapsuleButtonStyle(small: true))
            IslandV3ModuleBody(model: model, id: id)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
