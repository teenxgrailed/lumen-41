import XCTest
@testable import NeedtKit

final class QuitTests: XCTestCase {
    private func tempDir() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("quit-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testSummaryDecodesAgreedShapeAndToleratesMilestoneForms() throws {
        let object = #"{"currentStreakDays":3,"currentStreakHours":5,"reason":"Для дочки","nextMilestone":{"label":"7 дней","days":7}}"#
        let a = try JSONDecoder().decode(QuitSummary.self, from: Data(object.utf8))
        XCTAssertEqual(a.currentStreakDays, 3)
        XCTAssertEqual(a.reason, "Для дочки")
        XCTAssertEqual(a.nextMilestone, QuitMilestone(label: "7 дней", days: 7))
        let text = #"{"currentStreakDays":0,"currentStreakHours":2,"reason":null,"nextMilestone":"1 day"}"#
        let b = try JSONDecoder().decode(QuitSummary.self, from: Data(text.utf8))
        XCTAssertNil(b.reason)
        XCTAssertEqual(b.nextMilestone?.label, "1 day")
        let number = #"{"currentStreakDays":1,"currentStreakHours":0,"nextMilestone":7}"#
        XCTAssertEqual(try JSONDecoder().decode(QuitSummary.self, from: Data(number.utf8)).nextMilestone?.days, 7)
    }

    func testStreakAdvancesWithTimeSinceFetch() {
        let fetched = Date(timeIntervalSince1970: 1_000_000)
        let record = QuitRecord(habitId: "h1", summary: QuitSummary(currentStreakDays: 1, currentStreakHours: 20), fetchedAt: fetched)
        XCTAssertEqual(record.streak(at: fetched).days, 1)
        XCTAssertEqual(record.streak(at: fetched).hours, 20)
        let later = record.streak(at: fetched.addingTimeInterval(5 * 3600 + 120))
        XCTAssertEqual(later.days, 2)
        XCTAssertEqual(later.hours, 1)
        XCTAssertEqual(record.streak(at: fetched.addingTimeInterval(-3600)).hours, 20, "a clock set back never subtracts")
    }

    func testDeepLinkRoundTripAndRejections() {
        let url = QuitDeepLink.panic(habitId: "clx9abc-1_2")
        XCTAssertEqual(url?.absoluteString, "needt://habits/clx9abc-1_2/panic")
        XCTAssertEqual(url.flatMap(QuitDeepLink.habitId(from:)), "clx9abc-1_2")
        XCTAssertEqual(QuitDeepLink.webPath(habitId: "abc"), "/habits/abc/panic")
        XCTAssertNil(QuitDeepLink.panic(habitId: "../x"))
        XCTAssertNil(QuitDeepLink.panic(habitId: ""))
        XCTAssertNil(QuitDeepLink.habitId(from: URL(string: "needt://habits/abc/other")!))
        XCTAssertNil(QuitDeepLink.habitId(from: URL(string: "needt://open?path=/habits")!))
        XCTAssertNil(QuitDeepLink.habitId(from: URL(string: "https://habits/abc/panic")!))
        XCTAssertNil(QuitDeepLink.habitId(from: URL(string: "needt://habits/a%2Fb/panic")!))
    }

    func testStoreFlagAndPendingPanic() {
        let dir = tempDir()
        XCTAssertFalse(QuitFlag.isEnabled(in: dir), "off by default")
        QuitFlag.setEnabled(true, in: dir)
        XCTAssertTrue(QuitFlag.isEnabled(in: dir))
        QuitFlag.setEnabled(false, in: dir)
        XCTAssertFalse(QuitFlag.isEnabled(in: dir))

        let record = QuitRecord(habitId: "h1", summary: QuitSummary(currentStreakDays: 2, currentStreakHours: 3, reason: "r"), fetchedAt: Date(timeIntervalSince1970: 1_700_000_000))
        QuitStore.save(record, in: dir)
        XCTAssertEqual(QuitStore.load(habitId: "h1", in: dir), record)
        QuitStore.remove(habitId: "h1", in: dir)
        XCTAssertNil(QuitStore.load(habitId: "h1", in: dir))
        QuitStore.save(QuitRecord(habitId: "../evil", summary: record.summary, fetchedAt: Date()), in: dir)
        XCTAssertNil(QuitStore.load(habitId: "../evil", in: dir))

        QuitPendingPanic.set(habitId: "h1", in: dir)
        XCTAssertEqual(QuitPendingPanic.take(in: dir), "h1")
        XCTAssertNil(QuitPendingPanic.take(in: dir), "read once")
    }

    func testCopyUsesReasonStreakAndLanguage() {
        let fetched = Date(timeIntervalSince1970: 0)
        let record = QuitRecord(habitId: "h", summary: QuitSummary(currentStreakDays: 4, currentStreakHours: 6, reason: "Для дочки", nextMilestone: QuitMilestone(label: "7 дней")), fetchedAt: fetched)
        let ru = QuitCopy.make(record: record, now: fetched, languages: ["ru-CH"])
        XCTAssertEqual(ru.title, "Для дочки")
        XCTAssertEqual(ru.craving, "Тянет")
        XCTAssertTrue(ru.subtitle.contains("4 дн 6 ч"))
        XCTAssertTrue(ru.subtitle.contains("7 дней"))
        let en = QuitCopy.make(record: nil, languages: ["de-CH"])
        XCTAssertEqual(en.craving, "Craving", "unknown language falls back to English")
        XCTAssertEqual(QuitCopy.make(record: nil, languages: ["ru"]).title, "Ты бросаешь это")
    }
}
