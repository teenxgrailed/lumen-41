import AppIntents
import Foundation
import NeedtKit

enum FocusActionOption: String, AppEnum {
    case off, suggest, start

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Needt focus"
    static var caseDisplayRepresentations: [FocusActionOption: DisplayRepresentation] = [
        .off: "Do nothing",
        .suggest: "Suggest a focus task",
        .start: "Start focus on the next task",
    ]

    var mode: FocusFilterMode {
        switch self {
        case .off: return .off
        case .suggest: return .suggest
        case .start: return .start
        }
    }
}

/// Appears under System Settings, Focus, Focus Filters, Needt. The system runs
/// it when that Focus turns on; with the defaults (do nothing) it also stands
/// for the Focus turning off.
struct NeedtFocusFilter: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "Needt focus"
    static var description: IntentDescription? = IntentDescription(
        "Suggest or start a Needt focus run while this Focus is on."
    )

    @Parameter(title: "When this Focus is on", default: .off)
    var action: FocusActionOption

    @Parameter(title: "Project")
    var project: ProjectEntity?

    @Parameter(title: "Minutes", default: 25)
    var minutes: Int

    var displayRepresentation: DisplayRepresentation {
        let name = project?.name ?? "any project"
        switch action {
        case .off: return DisplayRepresentation(title: "Needt: nothing")
        case .suggest: return DisplayRepresentation(title: "Needt: suggest focus", subtitle: "\(name)")
        case .start: return DisplayRepresentation(title: "Needt: start focus", subtitle: "\(name)")
        }
    }

    func perform() async throws -> some IntentResult {
        FocusFilterStore.shared.save(
            FocusFilterState(mode: action.mode, projectId: project?.id, projectName: project?.name, minutes: minutes)
        )
        await AppController.shared.tray.focusFilterChanged()
        return .result()
    }
}
