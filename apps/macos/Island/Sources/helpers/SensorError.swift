import Foundation

enum SensorError: Error {
    enum Display: Error {
        case notFound
        case notSilicon
        case notStandard
    }
    enum Keyboard: Error {
        case notFound
        case notSilicon
        case notStandard
    }
}