import FamilyControls
import Foundation
import ManagedSettings
import NeedtKit

/// Which apps, web domains and categories each quit habit shields, kept in the
/// app group so the shield extensions can map a shielded token back to its
/// habit. Compiled into the app and all three quit extensions; only the app
/// writes. Tokens are opaque and only meaningful on this device.
struct QuitSelectionRegistry {
    struct Entry: Codable, Equatable {
        var selection: FamilyActivitySelection
        var schedule: QuitSchedule?
    }

    private let directory: URL

    init(directory: URL = SharedContainer.directory()) {
        self.directory = directory
    }

    private var file: URL { directory.appendingPathComponent("quit/selections.json") }

    func all() -> [String: Entry] {
        guard let data = try? Data(contentsOf: file),
              let entries = try? JSONDecoder().decode([String: Entry].self, from: data)
        else { return [:] }
        return entries
    }

    func entry(habitId: String) -> Entry? { all()[habitId] }

    func save(_ entry: Entry, habitId: String) {
        guard QuitDeepLink.isValid(habitId: habitId) else { return }
        var entries = all()
        entries[habitId] = entry
        write(entries)
    }

    func remove(habitId: String) {
        var entries = all()
        entries[habitId] = nil
        write(entries)
    }

    private func write(_ entries: [String: Entry]) {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(entries) { try? data.write(to: file, options: .atomic) }
    }

    // MARK: token lookup (shield extensions)

    func habitId(for token: ApplicationToken) -> String? {
        match { $0.selection.applicationTokens.contains(token) }
    }

    func habitId(for token: WebDomainToken) -> String? {
        match { $0.selection.webDomainTokens.contains(token) }
    }

    func habitId(for token: ActivityCategoryToken) -> String? {
        match { $0.selection.categoryTokens.contains(token) }
    }

    /// With a single quit habit configured, any shield is that habit's.
    func onlyHabitId() -> String? {
        let ids = all().keys
        return ids.count == 1 ? ids.first : nil
    }

    private func match(_ test: (Entry) -> Bool) -> String? {
        all().filter { test($0.value) }.keys.sorted().first
    }
}
