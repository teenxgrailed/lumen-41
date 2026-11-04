import Foundation

/// The words on a shield. An extension has no web view and no string catalog,
/// so the few strings live here: Russian, Ukrainian, English (fallback).
public struct QuitCopy: Equatable, Sendable {
    public var title: String
    public var subtitle: String
    public var craving: String
    public var dismiss: String

    public static func make(record: QuitRecord?, now: Date = Date(), languages: [String] = Locale.preferredLanguages) -> QuitCopy {
        let lang = languages.first.map { String($0.prefix(2)) } ?? "en"
        let words = Words.table[lang] ?? Words.table["en"]!
        let reason = record?.summary.reason?.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = (reason?.isEmpty == false) ? reason! : words.defaultTitle
        var subtitle = words.noStreak
        if let record {
            let s = record.streak(at: now)
            subtitle = words.streak(s.days, s.hours)
            if let next = record.summary.nextMilestone?.label, !next.isEmpty {
                subtitle += "\n" + words.next(next)
            }
        }
        return QuitCopy(title: title, subtitle: subtitle, craving: words.craving, dismiss: words.dismiss)
    }

    struct Words {
        var defaultTitle: String
        var noStreak: String
        var craving: String
        var dismiss: String
        var streak: (Int, Int) -> String
        var next: (String) -> String

        static let table: [String: Words] = [
            "ru": Words(defaultTitle: "Ты бросаешь это", noStreak: "Подожди минуту", craving: "Тянет", dismiss: "Закрыть",
                        streak: { "Без срыва: \($0) дн \($1) ч" }, next: { "Дальше: \($0)" }),
            "uk": Words(defaultTitle: "Ти кидаєш це", noStreak: "Зачекай хвилину", craving: "Тягне", dismiss: "Закрити",
                        streak: { "Без зриву: \($0) дн \($1) год" }, next: { "Далі: \($0)" }),
            "en": Words(defaultTitle: "You are quitting this", noStreak: "Wait a minute", craving: "Craving", dismiss: "Close",
                        streak: { "Clean for \($0) d \($1) h" }, next: { "Next: \($0)" }),
        ]
    }
}
