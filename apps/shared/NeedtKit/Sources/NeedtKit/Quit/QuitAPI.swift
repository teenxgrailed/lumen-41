import Foundation

extension NeedtAPI {
    /// `GET /api/habits/[id]/quit-summary`. Throws `badResponse` for an id that
    /// is not a plain habit id, so nothing odd reaches the path.
    public func quitSummary(habitId: String) async throws -> QuitSummary {
        guard QuitDeepLink.isValid(habitId: habitId) else { throw NeedtAPIError.badResponse }
        let data = try await request("/api/habits/\(habitId)/quit-summary")
        guard let summary = try? NeedtAPI.decoder.decode(QuitSummary.self, from: data) else {
            throw NeedtAPIError.badResponse
        }
        return summary
    }
}

public enum QuitSync {
    /// Fetches the summary and leaves it for the shield extensions.
    @discardableResult
    public static func refresh(habitId: String, api: NeedtAPI, now: Date = Date(),
                               directory: URL = SharedContainer.directory()) async throws -> QuitRecord {
        let record = QuitRecord(habitId: habitId, summary: try await api.quitSummary(habitId: habitId), fetchedAt: now)
        QuitStore.save(record, in: directory)
        return record
    }
}
