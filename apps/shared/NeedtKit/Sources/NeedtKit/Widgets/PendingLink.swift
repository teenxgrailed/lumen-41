import Foundation

/// A deep link an App Intent leaves for the app to open when it comes to the
/// front (the Quick add Control opens the app, and the app then shows the
/// capture screen). One small file in the shared container, read once.
public enum PendingLink {
    private static func url(_ directory: URL) -> URL { directory.appendingPathComponent("pending-link.txt") }

    public static func set(_ link: URL, in directory: URL = SharedContainer.directory()) {
        try? Data(link.absoluteString.utf8).write(to: url(directory), options: .atomic)
    }

    /// The stored link, removed so it opens once. Only `needt://open` links
    /// to known routes come back.
    public static func take(in directory: URL = SharedContainer.directory()) -> URL? {
        defer { try? FileManager.default.removeItem(at: url(directory)) }
        guard let data = try? Data(contentsOf: url(directory)),
              let text = String(data: data, encoding: .utf8),
              let link = URL(string: text), NeedtLink.path(from: link) != nil
        else { return nil }
        return link
    }
}
