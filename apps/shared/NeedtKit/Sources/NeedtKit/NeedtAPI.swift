import Foundation

public enum NeedtAPIError: Error, Equatable {
    case notSignedIn
    case http(Int)
    case badResponse
    /// The network could not be reached: reads fall back to the disk cache,
    /// writes are refused.
    case offline

    public var message: String {
        switch self {
        case .notSignedIn: return "Sign in to Needt first."
        case .http(let code): return "Needt answered with an error (\(code))."
        case .badResponse: return "Needt sent a response this app does not understand."
        case .offline: return OfflineCache.writeDisabledReason
        }
    }

    static func isConnectivity(_ error: Error) -> Bool {
        guard let url = error as? URLError else { return false }
        switch url.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
             .timedOut, .dataNotAllowed, .internationalRoamingOff, .dnsLookupFailed, .secureConnectionFailed:
            return true
        default:
            return false
        }
    }
}

/// A small client for Needt's own HTTP API, signed in by the same session
/// cookie the web app uses. The caller supplies the cookies (the Mac app reads
/// them from its WKWebView's cookie store; a widget would read an app-group
/// copy), so this type holds no credentials and stores nothing.
public final class NeedtAPI: @unchecked Sendable {
    public typealias CookieProvider = @Sendable () async -> [HTTPCookie]

    public let baseURL: URL
    private let session: URLSession
    private let cookies: CookieProvider

    public init(baseURL: URL, session: URLSession = .shared, cookies: @escaping CookieProvider) {
        self.baseURL = baseURL
        self.session = session
        self.cookies = cookies
    }

    private static func parseDate(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        return ISO8601DateFormatter().date(from: text)
    }

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let text = try c.decode(String.self)
            if let date = NeedtAPI.parseDate(text) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Bad date \(text)")
        }
        return d
    }()

    func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.host == baseURL.host
        else { throw NeedtAPIError.badResponse }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 15
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let all = await cookies()
        let jar = all.filter { cookie in
            guard let host = url.host else { return false }
            let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
            return host == domain || host.hasSuffix("." + domain)
        }
        guard !jar.isEmpty else { throw NeedtAPIError.notSignedIn }
        for (key, value) in HTTPCookie.requestHeaderFields(with: jar) {
            req.setValue(value, forHTTPHeaderField: key)
        }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" {
            req.httpBody = try JSONSerialization.data(withJSONObject: body ?? [:])
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            // Same-origin, like the page: the server refuses cross-site writes.
            var origin = baseURL.absoluteString
            while origin.hasSuffix("/") { origin.removeLast() }
            req.setValue(origin, forHTTPHeaderField: "Origin")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw NeedtAPIError.isConnectivity(error) ? NeedtAPIError.offline : error
        }
        guard let http = response as? HTTPURLResponse else { throw NeedtAPIError.badResponse }
        if http.statusCode == 401 { throw NeedtAPIError.notSignedIn }
        guard (200..<300).contains(http.statusCode) else { throw NeedtAPIError.http(http.statusCode) }
        return data
    }

    /// The signed-in person's plan from `GET /api/billing` (the field the web
    /// app's settings read): "FREE" or "PRO". A trial counts as "PRO".
    public func plan() async throws -> String {
        let data = try await request("/api/billing")
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let plan = object["plan"] as? String
        else { throw NeedtAPIError.badResponse }
        return plan.uppercased()
    }

    /// The running focus session, or nil when none runs.
    public func activeFocusSession() async throws -> FocusSession? {
        let data = try await request("/api/focus/session")
        return try Self.decoder.decode(FocusSessionEnvelope.self, from: data).session
    }

    /// All tasks the signed-in person can see (trash included; filter with `trashedAt`).
    public func tasks() async throws -> [TaskSummary] {
        let data = try await request("/api/tasks")
        return try Self.decoder.decode([TaskSummary].self, from: data)
    }

    /// Starts a focus session, optionally on a task.
    @discardableResult
    public func startFocus(taskId: String?, plannedMinutes: Int? = 25, intention: String? = nil,
                           origin: String = "mac") async throws -> FocusSession? {
        var body: [String: Any] = ["action": "start", "mode": "POMODORO", "phase": "FOCUS", "source": origin]
        if let taskId { body["taskId"] = taskId }
        if let plannedMinutes { body["plannedMinutes"] = plannedMinutes }
        if let intention { body["intention"] = intention }
        let data = try await request("/api/focus/session", method: "POST", body: body)
        return try Self.decoder.decode(FocusSessionEnvelope.self, from: data).session
    }

    public func pauseFocus(sessionId: String) async throws {
        _ = try await request("/api/focus/session", method: "POST", body: ["action": "pause", "sessionId": sessionId])
    }

    public func resumeFocus(sessionId: String) async throws {
        _ = try await request("/api/focus/session", method: "POST", body: ["action": "resume", "sessionId": sessionId])
    }

    public func stopFocus(sessionId: String, completed: Bool = false) async throws {
        _ = try await request(
            "/api/focus/session", method: "POST",
            body: ["action": "stop", "sessionId": sessionId, "completed": completed]
        )
    }

    // MARK: reads, with the disk cache behind them

    /// Runs a read; a good answer is cached, and when the network is down the
    /// last cached answer comes back marked stale.
    private func cachedRead<Value: Codable & Sendable>(
        _ key: OfflineCache.Key, cache: OfflineCache?, _ fetch: () async throws -> Value
    ) async throws -> ReadResult<Value> {
        do {
            let value = try await fetch()
            cache?.save(value, for: key)
            return ReadResult(value: value, staleSince: nil)
        } catch NeedtAPIError.offline {
            if let hit = cache?.load(Value.self, for: key) {
                return ReadResult(value: hit.value, staleSince: hit.savedAt)
            }
            throw NeedtAPIError.offline
        }
    }

    /// Tasks, falling back to the last successful response when offline.
    public func tasksCached(cache: OfflineCache? = .shared) async throws -> ReadResult<[TaskSummary]> {
        try await cachedRead(.tasks, cache: cache) { try await self.tasks() }
    }

    /// Today's open tasks (derived from the task list), cached the same way.
    public func todayCached(now: Date = Date(), cache: OfflineCache? = .shared) async throws -> ReadResult<[TaskSummary]> {
        let all = try await tasksCached(cache: cache)
        let list = Digest.today(all.value, now: now)
        if !all.isOffline { cache?.save(list, for: .today) }
        return ReadResult(value: list, staleSince: all.staleSince)
    }

    public func projects() async throws -> [ProjectSummary] {
        let data = try await request("/api/projects?status=active")
        return try Self.decoder.decode([ProjectSummary].self, from: data)
    }

    public func habits() async throws -> [HabitSummary] {
        let data = try await request("/api/habits")
        return try Self.decoder.decode(HabitsEnvelope.self, from: data).habits
    }

    // MARK: writes

    public struct NewTask: Sendable {
        public var title: String
        public var notes: String?
        public var projectId: String?
        public var dueDate: Date?
        public var durationMinutes: Int?

        public init(title: String, notes: String? = nil, projectId: String? = nil, dueDate: Date? = nil, durationMinutes: Int? = nil) {
            self.title = title
            self.notes = notes
            self.projectId = projectId
            self.dueDate = dueDate
            self.durationMinutes = durationMinutes
        }

        public var body: [String: Any] {
            var b: [String: Any] = ["title": title, "status": "todo"]
            if let notes, !notes.isEmpty { b["description"] = notes }
            if let projectId { b["projectId"] = projectId }
            if let dueDate { b["dueDate"] = ISO8601DateFormatter().string(from: dueDate) }
            if let durationMinutes, durationMinutes > 0 {
                b["duration"] = durationMinutes
                b["estimatedMinutes"] = durationMinutes
            }
            return b
        }
    }

    @discardableResult
    public func createTask(_ task: NewTask) async throws -> TaskSummary {
        let data = try await request("/api/tasks", method: "POST", body: task.body)
        return try Self.decoder.decode(TaskSummary.self, from: data)
    }

    public func completeTask(id: String) async throws {
        guard TrayState.validID(id) else { throw NeedtAPIError.badResponse }
        _ = try await request("/api/tasks/\(id)", method: "PUT", body: ["status": "completed"])
    }

    public func logHabitToday(id: String) async throws {
        guard TrayState.validID(id) else { throw NeedtAPIError.badResponse }
        _ = try await request("/api/habits/\(id)/completions/today", method: "PUT")
    }

    /// "Replan day": the same endpoint as the web app's replan button.
    /// 202 (queued) and 200 (done) both count as started.
    public func replan() async throws {
        _ = try await request("/api/tasks/schedule-all", method: "POST")
    }
}
