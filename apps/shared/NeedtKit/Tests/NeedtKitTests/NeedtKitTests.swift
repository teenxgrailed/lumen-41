import XCTest
@testable import NeedtKit

final class NeedtKitTests: XCTestCase {
    func testTrayStateParsesAndCleans() {
        let json: [String: Any] = [
            "open": 5,
            "overdue": 2,
            "next": [
                ["id": "a1", "title": "Write\u{0007} docs", "time": "11:00"],
                ["id": "bad id!", "title": "Dropped"],
                ["id": "b2", "title": "Edit selects"],
                ["id": "c3", "title": "Third"],
                ["id": "d4", "title": "Fourth"],
            ],
            "focus": "Focus 12 min left",
            "focusEndsAt": 4_102_444_800_000.0,
        ]
        let state = TrayState.parse(json: json)
        XCTAssertEqual(state?.open, 5)
        XCTAssertEqual(state?.overdue, 2)
        XCTAssertEqual(state?.next.map(\.id), ["a1", "b2", "c3"])
        XCTAssertEqual(state?.next.first?.title, "Write docs")
        XCTAssertNotNil(state?.focusSecondsLeft())
    }

    func testOlderPayloadStillParses() {
        let state = TrayState.parse(json: ["open": 1, "next": [Any](), "focus": NSNull()])
        XCTAssertEqual(state?.overdue, 0)
        XCTAssertNil(state?.focus)
    }

    func testClock() {
        XCTAssertEqual(formatClock(18 * 60 + 42), "18:42")
        XCTAssertEqual(formatClock(3725), "1:02:05")
    }
}
