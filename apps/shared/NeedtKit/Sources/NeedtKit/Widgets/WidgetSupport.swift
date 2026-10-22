import Foundation

/// Deep links the widgets use. Every region opens the exact object, not Home.
/// `needt://open?path=/today` is routed by the app's shell to
/// `https://use.needt.app/today` inside its web view (iOS: SceneDelegate, Mac:
/// AppDelegate). Only paths on Needt's own routes are accepted.
public enum NeedtLink {
    public static let scheme = "needt"

    public static func open(path: String) -> URL {
        var c = URLComponents()
        c.scheme = scheme
        c.host = "open"
        c.queryItems = [URLQueryItem(name: "path", value: path)]
        return c.url ?? URL(string: "needt://open")!
    }

    public static var today: URL { open(path: "/today") }
    public static var focus: URL { open(path: "/focus") }
    public static var habits: URL { open(path: "/habits") }
    public static var calendar: URL { open(path: "/calendar") }
    public static var quickAdd: URL { open(path: "/quick-add") }
    public static var signIn: URL { open(path: "/auth/signin") }

    public static func task(_ id: String) -> URL { open(path: "/tasks?task=\(id)") }

    private static let allowedRoots = ["/today", "/focus", "/habits", "/calendar", "/quick-add", "/tasks"]

    /// The in-app path a `needt://open?path=` link asks for, nil for anything
    /// that is not a plain path on one of Needt's routes.
    public static func path(from url: URL) -> String? {
        guard url.scheme == scheme, url.host == "open",
              let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "path" })?.value,
              raw.hasPrefix("/"), !raw.hasPrefix("//"), !raw.contains("\\"), raw.count <= 200,
              !raw.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
        else { return nil }
        let first = raw.dropFirst().prefix { $0 != "/" && $0 != "?" && $0 != "#" }
        let root = "/" + first
        if root == "/auth" { return raw.hasPrefix("/auth/signin") ? raw : nil }
        return allowedRoots.contains(root) ? raw : nil
    }
}

/// A short-lived mark left by an intent so the next render can say what
/// happened ("Could not sync. Try again.").
public struct WidgetFlash: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case toggleFailed }
    public var kind: Kind
    public var at: Date

    public static let lifetime: TimeInterval = 120

    private static func url(_ directory: URL) -> URL { directory.appendingPathComponent("widget-flash.json") }

    public static func set(_ kind: Kind, at: Date = Date(), in directory: URL = SharedContainer.directory()) {
        guard let data = try? JSONEncoder().encode(WidgetFlash(kind: kind, at: at)) else { return }
        try? data.write(to: url(directory), options: .atomic)
    }

    public static func clear(in directory: URL = SharedContainer.directory()) {
        try? FileManager.default.removeItem(at: url(directory))
    }

    /// True while a mark of this kind is younger than `lifetime`.
    public static func isActive(_ kind: Kind, now: Date = Date(), in directory: URL = SharedContainer.directory()) -> Bool {
        guard let data = try? Data(contentsOf: url(directory)),
              let flash = try? JSONDecoder().decode(WidgetFlash.self, from: data), flash.kind == kind
        else { return false }
        return now.timeIntervalSince(flash.at) < lifetime && flash.at <= now.addingTimeInterval(5)
    }
}

/// When a widget should render again. WidgetKit grants roughly 40 to 70
/// reloads a day and wants entries at least about 5 minutes apart, so the
/// boundaries here are the moments the picture really changes.
public enum WidgetTimelinePlan {
    public static let minimumGap: TimeInterval = 5 * 60
    public static let horizon: TimeInterval = 12 * 3600
    public static let maxEntries = 12

    /// `now` first, then the boundaries after it, spaced at least `minimumGap`.
    public static func dates(now: Date, boundaries: [Date]) -> [Date] {
        var out = [now]
        let limit = now.addingTimeInterval(horizon)
        for b in boundaries.sorted() where b > now && b <= limit {
            guard out.count < maxEntries, b.timeIntervalSince(out[out.count - 1]) >= minimumGap else { continue }
            out.append(b)
        }
        return out
    }

    /// When WidgetKit should ask for a new timeline. Never less than the gap.
    public static func reload(after last: Date, now: Date, fallback: TimeInterval = 20 * 60) -> Date {
        max(last, now).addingTimeInterval(fallback)
    }

    public static func today(snapshot: WidgetSnapshot?, now: Date, calendar: Calendar = .current) -> [Date] {
        var b: [Date] = []
        if let snapshot {
            b += snapshot.tasks.compactMap { $0.isDone ? nil : $0.when }
            b += snapshot.events.flatMap { [$0.start, $0.end] }
        }
        b.append(calendar.startOfDay(for: now).addingTimeInterval(24 * 3600))
        return dates(now: now, boundaries: b)
    }

    public static func next(snapshot: WidgetSnapshot?, now: Date) -> [Date] {
        var b: [Date] = []
        for e in snapshot?.events ?? [] where !e.allDay {
            b += [e.start.addingTimeInterval(-15 * 60), e.start, e.end]
        }
        return dates(now: now, boundaries: b)
    }

    public static func focus(snapshot: WidgetSnapshot?, now: Date) -> [Date] {
        guard let f = snapshot?.focus, !f.isPaused, let end = f.endDate else { return [now] }
        return dates(now: now, boundaries: [end])
    }

    public static func habits(snapshot: WidgetSnapshot?, now: Date, calendar: Calendar = .current) -> [Date] {
        let start = calendar.startOfDay(for: now)
        let risk = start.addingTimeInterval(TimeInterval(HabitsModel.riskHour) * 3600)
        return dates(now: now, boundaries: [risk, start.addingTimeInterval(24 * 3600)])
    }
}
