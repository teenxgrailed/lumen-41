import Foundation

/// `needt://habits/<id>/panic`: the «Тянет» button on a shield opens the habit's
/// panic screen. A shield extension cannot open a URL itself, so it leaves the
/// habit id with `QuitPendingPanic` and asks the system to open the app; the app
/// then turns the id into the web route below.
public enum QuitDeepLink {
    public static let host = "habits"

    /// Habit ids are cuids / UUIDs. Anything else never becomes a path.
    public static func isValid(habitId: String) -> Bool {
        guard !habitId.isEmpty, habitId.count <= 64 else { return false }
        return habitId.unicodeScalars.allSatisfy { scalar in
            (scalar.isASCII && CharacterSet.alphanumerics.contains(scalar)) || scalar == "-" || scalar == "_"
        }
    }

    public static func panic(habitId: String) -> URL? {
        guard isValid(habitId: habitId) else { return nil }
        return URL(string: "\(NeedtLink.scheme)://\(host)/\(habitId)/panic")
    }

    /// The habit id of a `needt://habits/<id>/panic` link, nil for anything else.
    public static func habitId(from url: URL) -> String? {
        guard url.scheme == NeedtLink.scheme, url.host == host else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, parts[1] == "panic", isValid(habitId: parts[0]) else { return nil }
        return parts[0]
    }

    /// The in-app web route the panic link opens (the screen itself comes with
    /// the design handoff).
    public static func webPath(habitId: String) -> String? {
        isValid(habitId: habitId) ? "/habits/\(habitId)/panic" : nil
    }
}
