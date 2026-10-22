import AppKit
import Combine
import Foundation
import NeedtKit

/// Feeds the island's data from what Needt already knows: the tray report
/// (the same one the menu bar uses), the HTTP API (tasks, the focus session,
/// the island settings), and the system (music, power, audio).
@MainActor
final class IslandV3Feed {
    private let model: IslandV3Model
    private let tray: TrayStore
    private var cancellables = Set<AnyCancellable>()
    private var timers: [Timer] = []
    private var tasks: [TaskSummary] = []
    private var sessionTotal: TimeInterval?
    private var sessionTaskId: String?
    private var lastSessionLookup: Date?
    private var refreshing = false
    private var volumeToken: AnyObject?
    private var observedPower = false
    #if !APPSTORE
    private var bluetooth: IslandV3BluetoothWatcher?
    #endif

    init(model: IslandV3Model, tray: TrayStore) {
        self.model = model
        self.tray = tray
    }

    func start() {
        model.tray = tray
        model.feed = self

        tray.$state
            .receive(on: RunLoop.main)
            .sink { [weak self] state in self?.apply(state) }
            .store(in: &cancellables)
        tray.$updatedAt
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.model.data.offline = !Connectivity.shared.isOnline }
            .store(in: &cancellables)

        watchMusic()
        watchPower()
        watchAudio()
        watchBluetooth()

        refreshPrefs()
        refreshTasks()

        let every = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refreshTasks() }
        }
        let prefsTimer = Timer(timeInterval: 900, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refreshPrefs() }
        }
        for timer in [every, prefsTimer] {
            RunLoop.main.add(timer, forMode: .common)
            timers.append(timer)
        }
        NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in self?.refreshPrefs(); self?.refreshTasks() }
            .store(in: &cancellables)
    }

    func stop() {
        cancellables.removeAll()
        timers.forEach { $0.invalidate() }
        timers.removeAll()
        volumeToken = nil
        #if !APPSTORE
        bluetooth = nil
        #endif
    }

    // MARK: tray report

    private func apply(_ state: TrayState) {
        var d = model.data
        if CIFixture.enabled { tasks = CIFixture.tasks() }
        let title = state.focusTitle ?? (state.isFocusActive ? "Focus" : d.focusTitle)
        d.focusTitle = title
        d.focusShort = FocusSync.shortTitle(title, max: 16) ?? "Focus"
        d.focusPaused = state.focus?.lowercased().contains("paused") ?? false
        if let end = state.focusEndDate, end > Date() {
            d.focusEnd = end
            if d.focusTotal <= 0 || sessionTotal == nil {
                d.focusTotal = max(end.timeIntervalSinceNow, 60)
            }
            lookUpSession()
        } else {
            d.focusEnd = nil
            sessionTotal = nil
        }
        if let total = sessionTotal { d.focusTotal = total }
        model.data = d
        recompute()
        model.settleIfResting()
    }

    /// The planned length of the running block, for the ring.
    private func lookUpSession() {
        if CIFixture.enabled { return }
        if let last = lastSessionLookup, Date().timeIntervalSince(last) < 20 { return }
        lastSessionLookup = Date()
        Task { [weak self] in
            guard let self, let session = try? await self.tray.api.activeFocusSession() else { return }
            self.sessionTaskId = session.taskId
            if let minutes = session.plannedMinutes {
                self.sessionTotal = TimeInterval(minutes * 60)
                self.model.data.focusTotal = TimeInterval(minutes * 60)
            }
        }
    }

    // MARK: tasks

    func refreshTasks() {
        Task { await refreshTasksNow() }
    }

    func refreshTasksNow() async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        if CIFixture.enabled {
            tasks = CIFixture.tasks()
            recompute()
            model.settleIfResting()
            return
        }
        do {
            let result = try await tray.api.tasksCached()
            tasks = result.value
            model.data.offline = result.isOffline
            recompute()
            model.settleIfResting()
        } catch {
            model.data.offline = !Connectivity.shared.isOnline
        }
    }

    private func recompute() {
        let now = Date()
        var d = model.data
        let open = tasks.filter { !$0.isDone && $0.trashedAt == nil }

        // Today list: open tasks of today, the running block left out.
        let today = Digest.today(open, now: now).filter { $0.title != d.focusTitle || !d.isFocusRunning }
        d.rows = today.prefix(4).map { task in
            IslandV3Row(
                id: task.id, title: task.title,
                time: Digest.timeLabel(task.when) ?? "today",
                color: IslandV3Palette.color(forProject: task.projectId)
            )
        }
        d.leftCount = today.count
        let plannedToday = today.reduce(0) { $0 + ($1.estimatedMinutes ?? 30) }
        let free = max(0, 8 * 60 - plannedToday)  // [unverified] against an 8 h day
        d.freeLabel = "\(IslandWeek.hoursLabel(free)) free"

        // The block after the running one.
        let horizon = d.focusEnd ?? now
        let candidates = open
            .filter { $0.id != sessionTaskId && ($0.title != d.focusTitle || !d.isFocusRunning) }
            .filter { ($0.when ?? .distantPast) >= horizon.addingTimeInterval(-120) }
            .sorted { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }
        if let next = candidates.first(where: { $0.when != nil }) {
            let cal = Calendar.current
            let label: String
            if let when = next.when, cal.isDateInToday(when) {
                label = Digest.timeLabel(when) ?? "today"
            } else {
                label = next.when.flatMap { cal.isDateInTomorrow($0) ? "tomorrow" : Digest.timeLabel($0) } ?? "later"
            }
            d.next = IslandV3Next(
                id: next.id, title: next.title,
                shortTitle: FocusSync.shortTitle(next.title, max: 18) ?? next.title,
                timeLabel: label,
                minutes: next.estimatedMinutes
            )
        } else {
            d.next = nil
        }

        // Week.
        let days = IslandWeek.days(open, now: now)
        d.week = days
        let planned = days.reduce(0) { $0 + $1.minutes }
        d.weekPlannedLabel = IslandWeek.hoursLabel(planned)
        let capacity = 5 * 8 * 60  // [unverified] five 8 h working days
        d.weekFreeLabel = "\(IslandWeek.hoursLabel(max(0, capacity - planned))) free"

        d.override = IslandOverrides.detect(tasks: tasks, focusPaused: d.focusPaused, now: now)
        model.data = d
    }

    // MARK: settings

    func refreshPrefs() {
        if CIFixture.enabled { return }
        Task { [weak self] in
            guard let self, let prefs = try? await self.tray.api.islandPrefs() else { return }
            self.model.prefs = prefs
            IslandV3Controller.shared.apply(prefs: prefs)
            self.model.settleIfResting()
        }
    }

    // MARK: music

    private func watchMusic() {
        let music = MusicManager.shared
        Publishers.CombineLatest4(music.$songTitle, music.$artistName, music.$isPlaying, music.$albumArt)
            .receive(on: RunLoop.main)
            .sink { [weak self] title, artist, playing, art in
                guard let self else { return }
                let was = self.model.data.music.isPlaying
                self.model.data.music = IslandV3Music(title: title, artist: artist, isPlaying: playing, art: art)
                if playing && !was { self.model.moment(.music) }
            }
            .store(in: &cancellables)
    }

    // MARK: power, audio, bluetooth

    private func watchPower() {
        guard !observedPower else { return }
        observedPower = true
        if let reading = IslandV3Power.read() { model.data.chargePercent = reading.percent }
        _ = BatteryActivityManager.shared.addObserver { [weak self] event in
            guard case .powerSourceChanged(let plugged) = event, plugged else { return }
            Task { @MainActor in
                guard let self else { return }
                if let reading = IslandV3Power.read() { self.model.data.chargePercent = reading.percent }
                self.model.moment(.charge)
            }
        }
    }

    private func watchAudio() {
        #if !APPSTORE
        if let volume = IslandV3Audio.shared.volume { model.data.volume = volume }
        volumeToken = IslandV3Audio.shared.observe { [weak self] value in
            Task { @MainActor in
                guard let self else { return }
                // The island's own scroll already shows its HUD.
                guard self.model.shapeMode != .hudv, abs(value - self.model.data.volume) > 0.005 else { return }
                self.model.data.volume = value
                self.model.moment(.hudv)
            }
        }
        #endif
    }

    private func watchBluetooth() {
        #if !APPSTORE
        bluetooth = IslandV3BluetoothWatcher { [weak self] name in
            Task { @MainActor in
                self?.model.data.airpodsName = name
                self?.model.moment(.airpods)
            }
        }
        #endif
    }
}
