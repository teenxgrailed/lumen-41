import Foundation

enum AppleScriptError: Error {
    case initScriptFailed
    case runtimeError
    case emptyOutput
}