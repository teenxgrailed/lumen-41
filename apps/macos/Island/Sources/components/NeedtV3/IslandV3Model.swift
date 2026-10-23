import AppKit
import Combine
import Defaults
import NeedtKit
import SwiftUI

/// The island's state machine. It owns which state the one shape is in and
/// when to change it; it never builds or rebuilds a view. Every change is
/// "content out (0.12 s), then the shape springs, then content in".
@MainActor
final class IslandV3Model: ObservableObject {
    // MARK: motion constants (CLAUDE-CODE-PROMPT.md, Notch island v3)

    /// Passive changes (live, warning, moments): the soft spring.
    static let softSpring = Animation.spring(response: 0.55, dampingFraction: 0.75)
    /// Open, close and the press: critically damped, no overshoot.
    static let calmSpring = Animation.spring(response: 0.5, dampingFraction: 1.0)
    static let contentOut = Animation.easeOut(duration: 0.12)
    static let contentIn = Animation.easeOut(duration: 0.34).delay(0.15)

    // MARK: published state

    @Published var metrics: IslandV3Metrics
    @Published var prefs = IslandPrefs()
    @Published private(set) var shapeMode: IslandV3Mode = .idle
    /// The layer that is visible; nil while the old content is leaving.
    @Published private(set) var contentMode: IslandV3Mode? = .idle
    @Published private(set) var tab: IslandV3Tab = .today
    @Published private(set) var module: IslandModuleID?
    /// Direction of the last tab change, for the slide.
    @Published private(set) var slide: CGFloat = 0
    /// The hover anticipation stretch.
    @Published var pre = false
    /// Proximity lean (pt, toward the cursor) and widening factor.
    @Published var lean: CGFloat = 0
    @Published var grow: CGFloat = 1
    @Published var data = IslandV3Data()
    @Published private(set) var standbyEnd: Date?
    @Published private(set) var goFlash = false
    @Published var addState = IslandV3AddState.idle
    @Published var addText = ""
    @Published var newRowID: String?
    @Published private(set) var calendarMonthShift = 0
    /// The file being dragged toward the island, for the fly-in.
    @Published var dropFlight: IslandV3DropFlight?

    /// The shape's target size for the current state (the window follows).
    var targetSize: IslandV3Size {
        IslandV3Geometry.size(mode: shapeMode, tab: tab, module: module, metrics: metrics)
    }

    // MARK: wiring

    /// Called before the shape animates, so the window can grow first.
    var onWillChange: ((IslandV3Size) -> Void)?
    /// Called when the open state wants the window to take keyboard focus.
    var onWantsKey: ((Bool) -> Void)?
    /// Every moment, before the prefs filter it: lets the primary display repeat
    /// it on the other screens (Displays: all).
    var onMoment: ((IslandV3Mode) -> Void)?
    var tray: TrayStore?
    var feed: IslandV3Feed?
    let isPreview: Bool

    private var gen = 0
    private var returnWork: DispatchWorkItem?
    private var hoverWork: DispatchWorkItem?
    private var clickWork: DispatchWorkItem?
    private var holdFired = false
    private var hovering = false
    private var tickTimer: Timer?
    private var standbyAuto = true
    private var standbyDismissedFor: Date?
    private var dragging = false

    init(metrics: IslandV3Metrics, preview: Bool = false) {
        self.metrics = metrics
        self.isPreview = preview
    }

    deinit { tickTimer?.invalidate() }

    // MARK: - lifecycle

    func start() {
        guard !isPreview else { return }
        tickTimer?.invalidate()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        tickTimer = timer
        settleToResting()
    }

    func stop() {
        tickTimer?.invalidate()
        tickTimer = nil
    }

    /// For the CI renderer: jump straight to a state, content visible, no motion.
    func showForRender(_ mode: IslandV3Mode, tab: IslandV3Tab = .today, module: IslandModuleID? = nil) {
        self.tab = tab
        self.module = module
        shapeMode = mode
        contentMode = mode
    }

    // MARK: - resting state

    /// What the island rests in right now, from the data alone.
    func resting(at now: Date = Date()) -> IslandV3Mode {
        if data.isFocusRunning, !data.focusPaused, data.focusEnd != nil {
            let call = IslandCadence.call(
                secondsLeft: data.secondsLeft(at: now),
                hasNext: data.next != nil,
                warnMinutes: prefs.warnMinutes,
                standbySeconds: prefs.standbySeconds
            )
            switch call {
            case .standby:
                if standbyDismissedFor != data.focusEnd { return .standby }
                return .warn
            case .warning: return .warn
            case .none: return .live
            }
        }
        if data.focusPaused { return .override }
        if data.override != nil { return .override }
        return .idle
    }

    func settleToResting() {
        let target = resting()
        if target == .standby { beginStandby(auto: true) } else { set(target) }
    }

    /// Data or settings changed: follow them unless the person is in the
    /// middle of something (peek, open, a moment, Standby).
    func settleIfResting() {
        guard !isPreview, shapeMode.isResting else { return }
        let target = resting()
        if target == .standby { beginStandby(auto: true) } else if target != shapeMode { set(target) }
    }

    private func tick() {
        let now = Date()
        // Standby counts down on its own and starts the next block at zero.
        if shapeMode == .standby, let end = standbyEnd {
            objectWillChange.send()
            if standbyAuto, now >= end { go() }
            return
        }
        if shapeMode == .open || shapeMode == .peek { objectWillChange.send(); return }
        guard shapeMode.isResting else { return }
        let target = resting(at: now)
        if target == .standby { beginStandby(auto: true) } else if target != shapeMode { set(target) }
    }

    // MARK: - the one transition

    func set(_ mode: IslandV3Mode, tab newTab: IslandV3Tab? = nil, module newModule: IslandModuleID? = nil) {
        if mode == shapeMode, newTab == nil || newTab == tab { return }
        returnWork?.cancel()
        gen += 1
        let token = gen
        let previous = shapeMode
        let calm = mode.isCalm || previous.isCalm
        if let newTab { tab = newTab }
        if let newModule { module = newModule }

        withAnimation(Self.contentOut) { contentMode = nil }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            guard let self, self.gen == token else { return }
            let next = IslandV3Geometry.size(mode: mode, tab: self.tab, module: self.module, metrics: self.metrics)
            self.onWillChange?(next)
            withAnimation(calm ? Self.calmSpring : Self.softSpring) { self.shapeMode = mode }
            withAnimation(Self.contentIn) { self.contentMode = mode }
            self.entered(mode, from: previous)
        }
    }

    private func entered(_ mode: IslandV3Mode, from previous: IslandV3Mode) {
        if mode == .peek || mode == .open { haptic() }
        if mode == .open {
            onWantsKey?(true)
            feed?.refreshTasks()
        } else if previous == .open {
            onWantsKey?(false)
            addState = .idle
            addText = ""
        }
        switch mode {
        case .done, .music, .airpods, .charge, .hudv:
            schedule(after: mode == .hudv ? 1.2 : 2.8) { [weak self] in self?.leaveMoment() }
        case .dropped:
            schedule(after: 1.5) { [weak self] in self?.leaveMoment() }
        case .go:
            goFlash = true
        default:
            goFlash = false
        }
    }

    private func leaveMoment() {
        guard shapeMode.isMoment || shapeMode == .dropped || shapeMode == .drop else { return }
        settleToResting()
    }

    private func schedule(after seconds: Double, _ block: @escaping () -> Void) {
        returnWork?.cancel()
        let work = DispatchWorkItem(block: block)
        returnWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    // MARK: - moments

    /// A short system event. It waits during Standby, is dropped in Quiet, and
    /// never interrupts what the person is doing in the island.
    func moment(_ mode: IslandV3Mode) {
        onMoment?(mode)
        guard mode.isMoment else { return }
        switch mode {
        case .music where !prefs.moments.now: return
        case .airpods where !prefs.moments.airpods: return
        case .charge where !prefs.moments.charging: return
        case .done where !prefs.moments.done: return
        case .hudv where !prefs.hud: return
        default: break
        }
        if shapeMode == .standby || shapeMode == .go, prefs.quietDuringStandby { return }
        guard shapeMode.isResting || shapeMode.isMoment else { return }
        set(mode)
    }

    // MARK: - pointer

    /// The target rectangle of the shape in screen coordinates, set by the
    /// window controller (top-centre of the screen).
    var shapeScreenRect: CGRect = .zero
    var screenTopCentre: CGPoint = .zero

    func pointerMoved(_ p: CGPoint) {
        if shapeMode == .open || dragging { return }
        // Proximity lean (v3.1): up to 10 pt toward the cursor, up to 7 % wider,
        // fading out at 220 pt.
        let dx = p.x - screenTopCentre.x
        let dy = abs(screenTopCentre.y - p.y)
        let k = max(0, 1 - hypot(dx, dy) / 220)
        let newLean = (max(-10, min(10, dx * 0.05)) * k)
        let newGrow = 1 + 0.07 * k
        if abs(newLean - lean) > 0.2 || abs(newGrow - grow) > 0.002 {
            withAnimation(.interactiveSpring(response: 0.25, dampingFraction: 0.85)) {
                lean = newLean
                grow = newGrow
            }
        }
        let inside = shapeScreenRect.insetBy(dx: -2, dy: -2).contains(p)
        if inside && !hovering { hoverEntered() } else if !inside && hovering { hoverExited() }
    }

    func pointerLeft() {
        withAnimation(.interactiveSpring(response: 0.3, dampingFraction: 0.9)) {
            lean = 0
            grow = 1
        }
        if hovering { hoverExited() }
    }

    private func hoverEntered() {
        hovering = true
        guard shapeMode.isResting || shapeMode.isMoment else { return }
        guard prefs.peek || prefs.openOn == .hover else { return }
        withAnimation(.easeOut(duration: 0.26)) { pre = true }
        let delay = prefs.hoverDelay
        hoverWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.hovering else { return }
            withAnimation(.easeOut(duration: 0.2)) { self.pre = false }
            guard self.shapeMode.isResting || self.shapeMode.isMoment, self.shapeMode != .standby else { return }
            self.set(.peek)
            if self.prefs.openOn == .hover {
                self.schedule(after: 0.9) { [weak self] in
                    guard let self, self.hovering, self.shapeMode == .peek else { return }
                    self.openIsland()
                }
            }
        }
        hoverWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func hoverExited() {
        hovering = false
        hoverWork?.cancel()
        withAnimation(.easeOut(duration: 0.2)) { pre = false }
        if shapeMode == .peek {
            returnWork?.cancel()
            settleToResting()
        }
    }

    // MARK: click, double-click, hold

    /// A single click on the closed island: open, after ~200 ms so a second
    /// click can turn it into a double-click.
    func clicked() {
        if holdFired { holdFired = false; return }
        guard shapeMode != .open, shapeMode != .standby, shapeMode != .go else { return }
        clickWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.openIsland() }
        clickWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
    }

    func doubleClicked() {
        clickWork?.cancel()
        guard shapeMode != .open else { return }
        toggleFocus()
    }

    /// Press and hold (0.65 s): Standby with Go.
    func held() {
        clickWork?.cancel()
        holdFired = true
        guard shapeMode != .open else { return }
        beginStandby(auto: false)
    }

    func openIsland(tab: IslandV3Tab = .today) {
        hoverWork?.cancel()
        withAnimation(.easeOut(duration: 0.1)) { pre = false }
        slide = 0
        let visible = prefs.visibleTabs.map(Self.map)
        let first = visible.contains(tab) ? tab : (visible.first ?? .today)
        set(.open, tab: first)
    }

    private static func map(_ t: IslandPrefs.Tab) -> IslandV3Tab {
        switch t {
        case .today: return .today
        case .week: return .week
        case .focus: return .focus
        }
    }

    /// Collapse: outside click or Esc.
    func collapse() {
        guard shapeMode == .open else { return }
        hovering = false
        settleToResting()
    }

    // MARK: tabs and modules

    func select(tab newTab: IslandV3Tab) {
        guard newTab != tab || (newTab == .more && module != nil) else { return }
        slide = newTab.order >= tab.order ? 1 : -1
        withAnimation(Self.calmSpring) {
            tab = newTab
            if newTab != .module { module = nil }
        }
        onWillChange?(targetSize)
    }

    func openModule(_ id: IslandModuleID) {
        slide = 1
        withAnimation(Self.calmSpring) {
            module = id
            tab = .module
        }
        onWillChange?(targetSize)
    }

    func backToMore() {
        slide = -1
        withAnimation(Self.calmSpring) {
            module = nil
            tab = .more
        }
        onWillChange?(targetSize)
    }

    func shiftCalendar(by delta: Int) { calendarMonthShift += delta }

    // MARK: - standby, go, skip

    func beginStandby(auto: Bool) {
        standbyAuto = auto
        standbyEnd = Date().addingTimeInterval(TimeInterval(prefs.standbySeconds))
        set(.standby)
    }

    func skip() {
        standbyDismissedFor = data.focusEnd
        standbyEnd = nil
        settleToResting()
    }

    /// Go: the current block ends, the next one starts.
    func go() {
        guard shapeMode == .standby else { return }
        standbyEnd = nil
        set(.go)
        guard let next = data.next, let tray else {
            schedule(after: 0.65) { [weak self] in self?.settleToResting() }
            return
        }
        let api = tray.api
        Task { [weak self] in
            do {
                if let session = try await api.activeFocusSession() {
                    try await api.stopFocus(sessionId: session.id, completed: true)
                    tray.nativeFocusEnded()
                }
                try await tray.startFocusNow(taskId: next.id, title: next.title, minutes: next.minutes ?? 25)
            } catch {
                // The block keeps running; the island goes back to resting.
            }
            try? await Task.sleep(nanoseconds: 650_000_000)
            self?.feed?.refreshTasks()
            self?.settleToResting()
        }
    }

    // MARK: - focus controls

    func toggleFocus() {
        guard let tray else { return }
        if data.isFocusRunning {
            tray.endFocus()
        } else {
            tray.startFocusOnNextTask()
        }
    }

    func togglePause() { tray?.togglePauseFocus() }

    /// Done: ends the block and its task; if it ends early, say how much.
    func finishFocus() {
        guard let tray else { return }
        let early = max(0, data.secondsLeft(at: Date()) / 60)
        let api = tray.api
        Task { [weak self] in
            do {
                if let session = try await api.activeFocusSession() {
                    try await api.stopFocus(sessionId: session.id, completed: true)
                    if let taskId = session.taskId { try? await api.completeTask(id: taskId) }
                }
                tray.nativeFocusEnded()
            } catch {
                return
            }
            guard let self else { return }
            self.data.earlyMinutes = early
            self.data.focusEnd = nil
            self.feed?.refreshTasks()
            if early >= 1 { self.moment(.done) } else { self.settleToResting() }
        }
    }

    func startFocus(minutes: Int) {
        guard let tray else { return }
        let task = data.next
        tray.startFocus(taskId: task?.id, title: task?.title, minutes: minutes)
    }

    func handBack() {
        guard let api = tray?.api, let override = data.override else { return }
        Task { [weak self] in
            try? await api.handBackToNeedt(taskIds: override.taskIds)
            self?.feed?.refreshTasks()
            self?.settleToResting()
        }
    }

    // MARK: - tasks in Today

    func complete(_ row: IslandV3Row) {
        guard let api = tray?.api else { return }
        Task { [weak self] in
            try? await api.completeTask(id: row.id)
            self?.feed?.refreshTasks()
        }
    }

    func trash(_ row: IslandV3Row) {
        guard let api = tray?.api else { return }
        Task { [weak self] in
            try? await api.trashTask(id: row.id)
            self?.feed?.refreshTasks()
        }
    }

    func beginAdd() {
        guard addState == .idle else { return }
        addState = .typing
        onWantsKey?(true)
    }

    func cancelAdd() {
        addState = .idle
        addText = ""
    }

    /// The real API and the scheduler: create the task, replan, read it back,
    /// and let the new row land highlighted.
    func submitAdd() {
        let title = addText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, addState == .typing, let api = tray?.api else { return }
        addState = .finding
        Task { [weak self] in
            do {
                let created = try await api.createTask(.init(title: title))
                try? await api.replan()
                await self?.feed?.refreshTasksNow()
                self?.newRowID = created.id
                self?.addText = ""
                self?.addState = .idle
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                if self?.newRowID == created.id { self?.newRowID = nil }
            } catch {
                self?.addState = .typing
            }
        }
    }

    /// "Plan my week" / "Plan tasks into it": the scheduler, then a fresh read.
    func planWeek() { replanNow() }
    func planDay() { replanNow() }

    private func replanNow() {
        guard let api = tray?.api else { return }
        Task { [weak self] in
            try? await api.replan()
            await self?.feed?.refreshTasksNow()
        }
    }

    // MARK: - scroll = volume, haptics

    func scrolled(deltaY: CGFloat) {
        #if !APPSTORE
        guard prefs.hud, shapeMode != .open else { return }
        let value = IslandV3Audio.shared.adjust(by: Double(deltaY) / 800)
        data.volume = value
        if shapeMode != .hudv { set(.hudv) } else { schedule(after: 1.2) { [weak self] in self?.leaveMoment() } }
        #endif
    }

    private func haptic() {
        guard prefs.haptics, Defaults[.enableHaptics], !isPreview else { return }
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
    }

    // MARK: - files dragged toward the island

    func dragBegan() { dragging = true }

    func dragNear(_ near: Bool) {
        if near, shapeMode != .drop, shapeMode != .dropped, shapeMode != .open {
            data.dropText = "Drop to Shelf"
            set(.drop)
        } else if !near, shapeMode == .drop {
            settleToResting()
        }
    }

    func dragEnded() { dragging = false }

    func dropped(name: String) {
        data.dropText = "\(name) is on the Shelf"
        dragging = false
        set(.dropped)
    }
}

enum IslandV3AddState: Equatable {
    case idle, typing, finding
}

struct IslandV3DropFlight: Equatable {
    var name: String
    var from: CGPoint
}
