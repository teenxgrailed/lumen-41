import Foundation

public enum NeedtAPIError: Error, Equatable {
    case notSignedIn
    case http(Int)
    case badResponse
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

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let text = try c.decode(String.self)
            if let date = NeedtAPI.parseDate(text) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Bad date \(text)")
        }
        return d
    }()

    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Data {
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
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            // Same-origin, like the page: the server refuses cross-site writes.
            var origin = baseURL.absoluteString
            while origin.hasSuffix("/") { origin.removeLast() }
            req.setValue(origin, forHTTPHeaderField: "Origin")
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw NeedtAPIError.badResponse }
        if http.statusCode == 401 { throw NeedtAPIError.notSignedIn }
        guard (200..<300).contains(http.statusCode) else { throw NeedtAPIError.http(http.statusCode) }
        return data
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
    public func startFocus(taskId: String?, plannedMinutes: Int? = 25, intention: String? = nil) async throws -> FocusSession? {
        var body: [String: Any] = ["action": "start", "mode": "POMODORO", "phase": "FOCUS", "source": "mac"]
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
}
