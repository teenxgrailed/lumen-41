import AppIntents
import Foundation
import NeedtKit

struct TaskEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Task"
    static var defaultQuery = TaskQuery()

    var id: String
    var title: String
    var detail: String?

    var displayRepresentation: DisplayRepresentation {
        if let detail {
            return DisplayRepresentation(title: "\(title)", subtitle: "\(detail)")
        }
        return DisplayRepresentation(title: "\(title)")
    }
}

struct TaskQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [TaskEntity] {
        let all = try await IntentSupport.run { try await IntentSupport.openTasks(api: $0) }
        let wanted = Set(identifiers)
        return all.filter { wanted.contains($0.id) }.map(IntentSupport.entity)
    }

    func entities(matching string: String) async throws -> [TaskEntity] {
        let all = try await IntentSupport.run { try await IntentSupport.openTasks(api: $0) }
        let needle = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return all.prefix(20).map(IntentSupport.entity) }
        return all.filter { $0.title.localizedCaseInsensitiveContains(needle) }
            .prefix(20).map(IntentSupport.entity)
    }

    func suggestedEntities() async throws -> [TaskEntity] {
        let all = try await IntentSupport.run { try await IntentSupport.openTasks(api: $0) }
        let today = Digest.today(all)
        let rest = all.filter { task in !today.contains(where: { $0.id == task.id }) }
        return (today + rest).prefix(20).map(IntentSupport.entity)
    }
}

struct ProjectEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Project"
    static var defaultQuery = ProjectQuery()

    var id: String
    var name: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct ProjectQuery: EntityStringQuery {
    private func all() async throws -> [ProjectEntity] {
        try await IntentSupport.run { try await $0.projects() }
            .map { ProjectEntity(id: $0.id, name: $0.name) }
    }

    func entities(for identifiers: [String]) async throws -> [ProjectEntity] {
        let wanted = Set(identifiers)
        return try await all().filter { wanted.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [ProjectEntity] {
        try await all().filter { $0.name.localizedCaseInsensitiveContains(string) }
    }

    func suggestedEntities() async throws -> [ProjectEntity] {
        try await all()
    }
}

struct HabitEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Habit"
    static var defaultQuery = HabitQuery()

    var id: String
    var title: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
}

struct HabitQuery: EntityStringQuery {
    private func all() async throws -> [HabitEntity] {
        try await IntentSupport.run { try await $0.habits() }
            .map { HabitEntity(id: $0.id, title: $0.title) }
    }

    func entities(for identifiers: [String]) async throws -> [HabitEntity] {
        let wanted = Set(identifiers)
        return try await all().filter { wanted.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [HabitEntity] {
        try await all().filter { $0.title.localizedCaseInsensitiveContains(string) }
    }

    func suggestedEntities() async throws -> [HabitEntity] {
        try await all()
    }
}
