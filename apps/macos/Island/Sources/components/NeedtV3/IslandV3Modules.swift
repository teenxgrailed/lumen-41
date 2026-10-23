import AppKit
import AVFoundation
import Combine
import EventKit
import NeedtKit
import SwiftUI

/// The seven system modules under the ••• grid.
struct IslandV3ModuleBody: View {
    @ObservedObject var model: IslandV3Model
    let id: IslandModuleID

    var body: some View {
        switch id {
        case .music: IslandV3MusicModule(model: model)
        case .cal: IslandV3CalendarModule(model: model)
        case .shelf: IslandV3ShelfModule()
        case .clip: IslandV3ClipboardModule()
        case .dev: IslandV3DevicesModule()
        case .tools: IslandV3ToolsModule()
        case .hud:
            // Direct download only: the volume path is not in the App Store build.
            #if APPSTORE
            EmptyView()
            #else
            IslandV3HUDModule(model: model)
            #endif
        }
    }
}

// MARK: - Music

struct IslandV3MusicModule: View {
    @ObservedObject var model: IslandV3Model
    @ObservedObject private var music = MusicManager.shared

    var body: some View {
        HStack(spacing: 16) {
            Group {
                if let art = model.data.music.art {
                    Image(nsImage: art).resizable().aspectRatio(contentMode: .fill)
                } else {
                    LinearGradient(colors: [Color(red: 1, green: 0.6, blue: 0.42), Color(red: 0.75, green: 0.22, blue: 0.48), Color(red: 0.23, green: 0.11, blue: 0.43)], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
            .frame(width: 104, height: 104)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(music.songTitle.isEmpty ? "Nothing playing" : music.songTitle)
                    .font(.system(size: 15, weight: .semibold)).lineLimit(1)
                Text([music.artistName, music.album].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).lineLimit(1)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let elapsed = music.isPlaying
                        ? music.elapsedTime + context.date.timeIntervalSince(music.timestampDate) * music.playbackRate
                        : music.elapsedTime
                    let total = max(1, music.songDuration)
                    VStack(spacing: 4) {
                        IslandV3Meter(value: min(1, elapsed / total)).frame(height: 4).padding(.top, 10)
                        HStack {
                            Text(IslandV3Format.clock(Int(elapsed)))
                            Spacer()
                            Text("-" + IslandV3Format.clock(Int(max(0, total - elapsed))))
                        }
                        .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).monospacedDigit()
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                Button { music.previousTrack() } label: { Image(systemName: "backward.fill") }
                    .buttonStyle(IslandCircleButtonStyle())
                Button { music.togglePlay() } label: {
                    Image(systemName: music.isPlaying ? "pause.fill" : "play.fill").foregroundStyle(Color.black)
                }
                .buttonStyle(IslandWhiteCircleStyle())
                Button { music.nextTrack() } label: { Image(systemName: "forward.fill") }
                    .buttonStyle(IslandCircleButtonStyle())
            }
        }
    }
}

struct IslandWhiteCircleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: 32, height: 32)
            .background(Circle().fill(Color.white.opacity(configuration.isPressed ? 0.8 : 1)))
    }
}

// MARK: - Calendar

@MainActor
final class IslandV3CalendarStore: ObservableObject {
    struct Item: Identifiable, Equatable {
        var id: String
        var start: Date
        var end: Date
        var title: String
        var detail: String
        var color: Color
        var joinURL: URL?
        var allDay: Bool
    }

    @Published var events: [Item] = []
    @Published var denied = false
    private let store = EKEventStore()
    private var granted = false

    func load(from start: Date, to end: Date) {
        if granted { fetch(start, end); return }
        store.requestFullAccessToEvents { [weak self] ok, _ in
            Task { @MainActor in
                guard let self else { return }
                self.granted = ok
                self.denied = !ok
                if ok { self.fetch(start, end) }
            }
        }
    }

    private func fetch(_ start: Date, _ end: Date) {
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }.map { e in
            Item(
                id: e.eventIdentifier ?? UUID().uuidString,
                start: e.startDate, end: e.endDate,
                title: e.title ?? "Event",
                detail: e.location ?? "",
                color: Color(cgColor: e.calendar.cgColor),
                joinURL: Self.joinURL(e),
                allDay: e.isAllDay
            )
        }
    }

    private static func joinURL(_ e: EKEvent) -> URL? {
        let text = [e.url?.absoluteString, e.location, e.notes].compactMap { $0 }.joined(separator: " ")
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        for match in detector.matches(in: text, options: [], range: range) {
            if let url = match.url, let host = url.host?.lowercased(),
               host.contains("zoom") || host.contains("meet.google") || host.contains("teams.microsoft") {
                return url
            }
        }
        return nil
    }
}

struct IslandV3CalendarModule: View {
    @ObservedObject var model: IslandV3Model
    @StateObject private var store = IslandV3CalendarStore()
    @State private var picked = Calendar.current.startOfDay(for: Date())

    private var cal: Calendar { Calendar.current }

    /// Three weeks around today (the week before, this week, the week after),
    /// shifted by the arrows.
    private var weeks: [[Date]] {
        let today = cal.startOfDay(for: Date())
        guard let thisWeek = cal.dateInterval(of: .weekOfYear, for: today)?.start,
              let first = cal.date(byAdding: .day, value: -7 + model.calendarMonthShift * 21, to: thisWeek)
        else { return [] }
        return (0..<3).map { w in
            (0..<7).compactMap { d in cal.date(byAdding: .day, value: w * 7 + d, to: first) }
        }
    }

    var body: some View {
        let grid = weeks
        HStack(alignment: .top, spacing: 18) {
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(monthTitle(grid)).font(.system(size: 17, weight: .bold))
                    Text(yearTitle(grid)).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.white.opacity(0.5))
                    Spacer()
                    Button { model.shiftCalendar(by: -1); reload() } label: { Image(systemName: "chevron.left") }
                        .buttonStyle(.plain).frame(width: 26, height: 26).accessibilityLabel("Previous")
                    Button { model.shiftCalendar(by: 1); reload() } label: { Image(systemName: "chevron.right") }
                        .buttonStyle(.plain).frame(width: 26, height: 26).accessibilityLabel("Next")
                }
                .padding(.bottom, 8)
                HStack(spacing: 0) {
                    ForEach(Array((grid.first ?? []).enumerated()), id: \.offset) { _, day in
                        Text(weekday(day)).font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color.white.opacity(0.45)).frame(maxWidth: .infinity)
                    }
                }
                .padding(.bottom, 6)
                ForEach(Array(grid.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: 0) {
                        ForEach(week, id: \.self) { day in dayCell(day) }
                    }
                }
            }
            .frame(width: 300)
            dayView
        }
        .onAppear { reload() }
    }

    private func dayCell(_ day: Date) -> some View {
        let isToday = cal.isDateInToday(day)
        let isPicked = cal.isDate(day, inSameDayAs: picked)
        let dots = store.events.first { cal.isDate($0.start, inSameDayAs: day) }
        return Button { picked = day } label: {
            ZStack {
                Text("\(cal.component(.day, from: day))")
                    .font(.system(size: 14, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(isPicked ? Color.white : (isToday ? IslandV3Palette.accent : Color.white))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(isPicked ? IslandV3Palette.accent : .clear))
                if let dots, !isPicked {
                    Circle().fill(dots.color).frame(width: 4, height: 4).offset(y: 14)
                }
            }
            .frame(maxWidth: .infinity).frame(height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var dayView: some View {
        let list = store.events.filter { cal.isDate($0.start, inSameDayAs: picked) }
        let nextID = list.first { $0.end > Date() }?.id
        return VStack(alignment: .leading, spacing: 6) {
            if store.denied {
                emptyState(title: "Calendar access is off", detail: "Allow Needt in System Settings, Privacy & Security, Calendars.", button: nil)
            } else if list.isEmpty {
                emptyState(title: "No events", detail: "The whole day is yours · \(model.data.freeLabel.replacingOccurrences(of: " free", with: "")) free", button: "Plan tasks into it")
            } else {
                HStack(alignment: .firstTextBaseline) {
                    Text(dayTitle()).font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Text("\(list.count) event\(list.count == 1 ? "" : "s")").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                }
                .padding(.horizontal, 2).padding(.bottom, 4)
                ForEach(list.prefix(3)) { item in
                    HStack(alignment: .top, spacing: 12) {
                        Text(item.allDay ? "all day" : IslandV3Format.time(item.start))
                            .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.6)).monospacedDigit()
                            .frame(width: 40, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                            Text(item.detail.isEmpty ? IslandWeek.hoursLabel(Int(item.end.timeIntervalSince(item.start) / 60)) : item.detail)
                                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        if item.id == nextID, cal.isDateInToday(picked), let url = item.joinURL {
                            Button("Join") { NSWorkspace.shared.open(url) }
                                .buttonStyle(IslandCapsuleButtonStyle(prominent: true, small: true))
                        }
                    }
                    .padding(.horizontal, 10).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.06)))
                    .overlay(alignment: .leading) {
                        // The coloured left rule.
                        Rectangle().fill(item.color).frame(width: 3).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .id(picked)
        .transition(.opacity)
    }

    private func emptyState(title: String, detail: String, button: String?) -> some View {
        VStack(spacing: 4) {
            Image(systemName: "calendar.badge.checkmark").font(.system(size: 28)).foregroundStyle(Color.white.opacity(0.8)).padding(.bottom, 4)
            Text(title).font(.system(size: 15, weight: .semibold))
            Text(detail).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).multilineTextAlignment(.center)
            if let button {
                Button(button) { model.planDay() }
                    .buttonStyle(IslandCapsuleButtonStyle(small: true)).padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func reload() {
        guard let first = weeks.first?.first, let last = weeks.last?.last,
              let end = cal.date(byAdding: .day, value: 1, to: last) else { return }
        store.load(from: first, to: end)
    }

    private func monthTitle(_ grid: [[Date]]) -> String {
        let f = DateFormatter(); f.dateFormat = "LLLL"
        return (grid.dropFirst().first?.first).map { f.string(from: $0) } ?? ""
    }

    private func yearTitle(_ grid: [[Date]]) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy"
        return (grid.dropFirst().first?.first).map { f.string(from: $0) } ?? ""
    }

    private func weekday(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "EEEEE"
        return f.string(from: d)
    }

    private func dayTitle() -> String {
        if cal.isDateInToday(picked) { return "Today" }
        if cal.isDateInTomorrow(picked) { return "Tomorrow" }
        let f = DateFormatter(); f.dateFormat = "EEE d"
        return f.string(from: picked)
    }
}

// MARK: - Shelf

struct IslandV3ShelfModule: View {
    @ObservedObject private var shelf = ShelfStateViewModel.shared

    var body: some View {
        HStack(spacing: 10) {
            ForEach(shelf.items.prefix(5)) { item in
                Button {
                    if let url = shelf.resolveFileURL(for: item) { NSWorkspace.shared.open(url) }
                } label: {
                    VStack(spacing: 8) {
                        Image(nsImage: item.icon).resizable().aspectRatio(contentMode: .fit).frame(width: 44, height: 54)
                        Text(item.displayName).font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.7))
                            .lineLimit(1).frame(maxWidth: 86)
                    }
                    .frame(width: 96, height: 106)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.07)))
                }
                .buttonStyle(.plain)
                .contextMenu { Button("Remove from Shelf") { shelf.remove(item) } }
            }
            VStack(spacing: 2) {
                Image(systemName: "plus").font(.system(size: 20))
                Text("Drop files here").font(.system(size: 12))
            }
            .foregroundStyle(Color.white.opacity(0.6))
            .frame(maxWidth: .infinity).frame(height: 106)
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.white.opacity(0.22), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        }
    }
}

// MARK: - Clipboard

struct IslandV3ClipboardModule: View {
    @ObservedObject private var clip = ClipboardManager.shared

    var body: some View {
        VStack(spacing: 4) {
            if clip.clipboardHistory.isEmpty {
                Text("Copy something and it shows up here.")
                    .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            ForEach(clip.clipboardHistory.prefix(4)) { item in
                Button { clip.copyToClipboard(item) } label: {
                    HStack(spacing: 12) {
                        Text("\(item.type.rawValue.capitalized)").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.45))
                            .frame(width: 48, alignment: .leading)
                        Text(item.preview).font(.system(size: 12.5)).lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.05)))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .onAppear { clip.startMonitoring() }
    }
}

// MARK: - Devices

struct IslandV3DevicesModule: View {
    @State private var battery = IslandV3Power.read()
    @State private var output = IslandV3Audio.shared.outputName

    var body: some View {
        HStack(spacing: 10) {
            card(
                ring: Double(battery?.percent ?? 0) / 100,
                label: battery.map { "\($0.percent)" } ?? "–",
                color: (battery?.percent ?? 100) < 20 ? IslandV3Palette.red : ((battery?.isCharging ?? false) ? IslandV3Palette.green : .white),
                name: Host.current().localizedName ?? "This Mac",
                detail: (battery?.isCharging ?? false) ? "Charging" : ((battery?.isPluggedIn ?? false) ? "Plugged in" : "On battery")
            )
            VStack(spacing: 6) {
                Image(systemName: "speaker.wave.2.fill").font(.system(size: 20))
                Text(output ?? "No output").font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
                Text("Sound output").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.06)))
        }
        .frame(height: 110)
        .onReceive(Timer.publish(every: 5, on: .main, in: .common).autoconnect()) { _ in
            battery = IslandV3Power.read()
            output = IslandV3Audio.shared.outputName
        }
    }

    private func card(ring: Double, label: String, color: Color, name: String, detail: String) -> some View {
        VStack(spacing: 4) {
            ZStack {
                IslandRing(progress: ring, size: 40, line: 4, color: color)
                Text(label).font(.system(size: 12, weight: .semibold)).monospacedDigit()
            }
            Text(name).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
            Text(detail).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.06)))
    }
}

// MARK: - Tools (Timer, Mirror, Weather)

struct IslandV3ToolsModule: View {
    @State private var end: Date?
    @State private var minutes = 5
    @ObservedObject private var weather = IslandV3Weather.shared
    @Environment(\.islandStatic) private var isStatic

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Timer").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5))
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let left = end.map { max(0, Int($0.timeIntervalSince(context.date).rounded(.up))) } ?? minutes * 60
                    Text(IslandV3Format.clock(left)).font(.system(size: 26, weight: .semibold)).monospacedDigit()
                        .frame(width: 84, alignment: .leading)
                }
                Spacer()
                HStack(spacing: 8) {
                    Button(end == nil ? "Start" : "Stop") {
                        end = end == nil ? Date().addingTimeInterval(TimeInterval(minutes * 60)) : nil
                    }
                    .buttonStyle(IslandCapsuleButtonStyle(prominent: end == nil, small: true))
                    Button("+1 min") { minutes += 1; if end != nil { end = end?.addingTimeInterval(60) } }
                        .buttonStyle(IslandCapsuleButtonStyle(small: true))
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.06)))
            VStack(alignment: .leading, spacing: 3) {
                Text("Mirror").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5))
                Group {
                    if isStatic {
                        // The CI renderer never opens the camera.
                        Color(white: 0.12).overlay(Image(systemName: "camera.fill").foregroundStyle(Color.white.opacity(0.3)))
                    } else {
                        IslandV3MirrorView()
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.06)))
            IslandV3WeatherTile(weather: weather)
        }
        .frame(height: 140)
        .onAppear { if !isStatic { weather.refresh() } }
    }
}

/// The camera, only while this page is on screen.
struct IslandV3MirrorView: NSViewRepresentable {
    func makeNSView(context: Context) -> IslandV3MirrorNSView { IslandV3MirrorNSView() }
    func updateNSView(_ view: IslandV3MirrorNSView, context: Context) {}
    static func dismantleNSView(_ view: IslandV3MirrorNSView, coordinator: ()) { view.stop() }
}

final class IslandV3MirrorNSView: NSView {
    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor(white: 0.12, alpha: 1).cgColor
        AVCaptureDevice.requestAccess(for: .video) { [weak self] ok in
            guard ok else { return }
            DispatchQueue.main.async { self?.begin() }
        }
    }

    required init?(coder: NSCoder) { nil }

    private func begin() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return }
        session.addInput(input)
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = bounds
        layer.setAffineTransform(CGAffineTransform(scaleX: -1, y: 1))
        self.layer?.addSublayer(layer)
        preview = layer
        DispatchQueue.global(qos: .userInitiated).async { [session] in session.startRunning() }
    }

    override func layout() {
        super.layout()
        preview?.frame = bounds
    }

    func stop() {
        DispatchQueue.global(qos: .userInitiated).async { [session] in session.stopRunning() }
    }
}

// MARK: - HUD (direct build)

#if !APPSTORE
struct IslandV3HUDModule: View {
    @ObservedObject var model: IslandV3Model

    var body: some View {
        let volume = model.data.volume
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: IslandV3Format.speakerSymbol(volume)).frame(width: 24)
                Slider(value: Binding(get: { model.data.volume }, set: { model.data.volume = IslandV3Audio.shared.set($0) }), in: 0...1)
                Text("\(Int((volume * 100).rounded()))%").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).monospacedDigit().frame(width: 40, alignment: .trailing)
            }
            HStack {
                Text(IslandV3Audio.shared.outputName.map { "Output · \($0)" } ?? "Output")
                    .lineLimit(1)
                Spacer(minLength: 10)
                Text("Scroll over the closed island to change it")
            }
            .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
        }
        .padding(.top, 6)
        .onAppear { if let v = IslandV3Audio.shared.volume { model.data.volume = v } }
    }
}
#endif
