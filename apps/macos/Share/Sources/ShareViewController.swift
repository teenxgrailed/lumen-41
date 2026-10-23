import AppKit
import NeedtKit
import SwiftUI
import UniformTypeIdentifiers

/// "Add to Needt" in the Share menu. A URL or text from any app becomes a
/// task: the title is the page title (else the first line of the text), the
/// link goes in the notes. The session comes from the vault the app fills in
/// the shared App Group container; this extension never sees a password.
final class ShareViewController: NSViewController {
    private let model = ShareModel()

    override func loadView() {
        let root = ShareView(
            model: model,
            cancel: { [weak self] in
                self?.extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
            },
            finish: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        )
        let host = NSHostingView(rootView: root)
        host.sizingOptions = []
        host.frame = NSRect(x: 0, y: 0, width: 420, height: 300)
        view = host
        preferredContentSize = host.frame.size
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        Task { @MainActor in await model.load(items) }
    }
}

@MainActor
final class ShareModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case ready
        case sending
        case failed(String)
    }

    @Published var title = ""
    @Published var notes = ""
    @Published private(set) var phase: Phase = .loading
    /// Writes are off while the network is down; the sheet says why.
    @Published private(set) var offline = false

    static let base = URL(string: "https://use.needt.app")!

    private let api = NeedtAPI(baseURL: ShareModel.base) { CookieVault.shared.load() }

    var canSend: Bool {
        !offline && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && phase != .loading && phase != .sending
    }

    func load(_ items: [NSExtensionItem]) async {
        var pageTitle: String?
        var text: String?
        var url: URL?
        for item in items {
            if pageTitle == nil { pageTitle = item.attributedTitle?.string }
            if text == nil { text = item.attributedContentText?.string }
            for provider in item.attachments ?? [] {
                if url == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) {
                    url = Self.url(from: value)
                }
                if text == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let value = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) {
                    text = Self.string(from: value)
                }
            }
        }
        // Only web links are tasks' links; a file URL says nothing useful.
        if let candidate = url, !(candidate.scheme?.hasPrefix("http") ?? false) { url = nil }
        let draft = ShareDraft.make(title: pageTitle, text: text, url: url)
        title = draft.title
        notes = draft.notes ?? ""
        phase = .ready
    }

    private static func url(from value: NSSecureCoding) -> URL? {
        if let url = value as? URL { return url }
        if let data = value as? Data { return URL(dataRepresentation: data, relativeTo: nil) }
        if let text = value as? String { return URL(string: text) }
        return nil
    }

    private static func string(from value: NSSecureCoding) -> String? {
        if let text = value as? String { return text }
        if let data = value as? Data { return String(data: data, encoding: .utf8) }
        return nil
    }

    /// Returns true when the task was created.
    func send() async -> Bool {
        phase = .sending
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await api.createTask(.init(title: name, notes: body.isEmpty ? nil : body))
            return true
        } catch let error as NeedtAPIError {
            offline = error == .offline
            phase = .failed(error == .notSignedIn ? "Open Needt and sign in, then share again." : error.message)
        } catch {
            phase = .failed("Needt could not save this. Try again.")
        }
        return false
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel
    let cancel: () -> Void
    let finish: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add to Needt")
                .font(.headline)
            TextField("Title", text: $model.title)
                .textFieldStyle(.roundedBorder)
            TextField("Notes", text: $model.notes, axis: .vertical)
                .lineLimit(3...6)
                .textFieldStyle(.roundedBorder)
            if case .failed(let message) = model.phase {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            HStack {
                Spacer()
                Button("Cancel", action: cancel)
                    .keyboardShortcut(.cancelAction)
                Button("Add task") {
                    Task {
                        if await model.send() { finish() }
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(!model.canSend)
            }
        }
        .padding(20)
        .frame(width: 420, height: 300)
    }
}
