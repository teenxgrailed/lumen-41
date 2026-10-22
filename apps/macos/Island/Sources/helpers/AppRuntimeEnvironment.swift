import Foundation

/// Runtime context flags used to keep the app's launch deterministic on CI.
enum AppRuntimeEnvironment {
    /// `true` only in DEBUG builds launched by XCUITest (`--uitesting`); always false in Release.
    static let isUITesting: Bool = {
        #if DEBUG
        return CommandLine.arguments.contains("--uitesting")
        #else
        return false
        #endif
    }()
}
