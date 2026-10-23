import Foundation

/// Pure helpers behind "What's today", "What's next" and the Spotlight index.
public enum Digest {
    /// Open tasks that belong to today: scheduled or due today, or overdue.
    /// Sorted by time, tasks with no time last.
    public static func today(_ tasks: [TaskSummary], now: Date = Date(), calendar: Calendar = .current) -> [TaskSummary] {
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        return tasks
            .filter { !$0.isDone && $0.trashedAt == nil }
            .filter { task in
                guard let when = task.when else { return false }
                return when < endOfDay
            }
            .sorted { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }
    }

    /// The next open task at or after `now`; falls back to the earliest
    /// overdue one when nothing is ahead.
    public static func next(_ tasks: [TaskSummary], now: Date = Date()) -> TaskSummary? {
        let open = tasks.filter { !$0.isDone && $0.trashedAt == nil && $0.when != nil }
        let upcoming = open.filter { ($0.when ?? .distantPast) >= now }
            .min { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }
        return upcoming ?? open.min { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }
    }

    public static func timeLabel(_ date: Date?, calendar: Calendar = .current) -> String? {
        guard let date else { return nil }
        let c = calendar.dateComponents([.hour, .minute], from: date)
        // Date-only values (midnight) carry no time of day.
        if c.hour == 0 && c.minute == 0 { return nil }
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    public static func line(_ task: TaskSummary, calendar: Calendar = .current) -> String {
        if let time = timeLabel(task.when, calendar: calendar) { return "\(time) \(task.title)" }
        return task.title
    }

    /// The sentence Siri or Shortcuts reads for today.
    public static func todayText(_ tasks: [TaskSummary], now: Date = Date(), calendar: Calendar = .current) -> String {
        let list = today(tasks, now: now, calendar: calendar)
        guard !list.isEmpty else { return "Nothing planned for today." }
        let head = list.count == 1 ? "1 item today" : "\(list.count) items today"
        return ([head + ":"] + list.prefix(8).map { "• " + line($0, calendar: calendar) }).joined(separator: "\n")
            + (list.count > 8 ? "\n…and \(list.count - 8) more" : "")
    }

    public static func nextText(_ task: TaskSummary?, calendar: Calendar = .current) -> String {
        guard let task else { return "Nothing coming up." }
        return "Next: " + line(task, calendar: calendar)
    }
}

/// What a Share sheet hands over, turned into a task.
public struct ShareDraft: Equatable, Sendable {
    public var title: String
    public var notes: String?

    /// `title` is the page title when the source app gave one; `text` the
    /// shared text; `url` a shared link. A URL goes in the notes, the title
    /// is the page title, else the first line of text, else the host.
    public static func make(title: String?, text: String?, url: URL?) -> ShareDraft {
        func firstLine(_ value: String?) -> String? {
            guard let value else { return nil }
            let line = value.split(whereSeparator: \.isNewline).first.map(String.init)?
                .trimmingCharacters(in: .whitespaces)
            return (line?.isEmpty ?? true) ? nil : line
        }
        let textIsURL = text.flatMap { URL(string: $0.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .map { $0.scheme?.hasPrefix("http") ?? false } ?? false
        let link = url ?? (textIsURL ? text.flatMap { URL(string: $0.trimmingCharacters(in: .whitespacesAndNewlines)) } : nil)
        var name = firstLine(title) ?? (textIsURL ? nil : firstLine(text)) ?? link?.host ?? "Shared item"
        if name.count > 200 { name = String(name.prefix(200)) }
        var notes: [String] = []
        if let link { notes.append(link.absoluteString) }
        if !textIsURL, let text, let body = Optional(text.trimmingCharacters(in: .whitespacesAndNewlines)),
           !body.isEmpty, body != name {
            notes.append(body)
        }
        return ShareDraft(title: name, notes: notes.isEmpty ? nil : notes.joined(separator: "\n\n"))
    }
}
