import Network
import NeedtKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Needt" in the Share sheet. A web link or text from any app becomes a task:
/// the title is the page title (else the first line of the text), the link goes
/// in the notes. The session comes from the vault the app fills in the shared
/// App Group container; this extension never sees a password. The Mac app has
/// the same extension (apps/macos/Share); the draft rules live in NeedtKit
/// (`ShareDraft`). //todo: move ShareModel into NeedtKit once both share it.
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = ShareView(
            model: model,
            cancel: { [weak self] in
                self?.extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
            },
            finish: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        )
        let host = UIHostingController(rootView: root)
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)

        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        model.watchConnection()
        Task { await model.load(items) }
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

    private var monitor: NWPathMonitor?

    private let api = NeedtAPI(baseURL: WidgetEnvironment.baseURL) { CookieVault.shared.load() }

    var canSend: Bool {
        !offline && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && phase != .loading && phase != .sending
    }

    /// Turns Add back on when the connection returns after an offline failure.
    func watchConnection() {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.offline = false }
        }
        monitor.start(queue: DispatchQueue(label: "app.needt.ios.share-path"))
        self.monitor = monitor
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
        offline = false
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
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $model.title)
                    TextField("Notes", text: $model.notes, axis: .vertical)
                        .lineLimit(3...6)
                }
                if case .failed(let message) = model.phase {
                    Section {
                        Text(message)
                            .font(.system(size: 13))
                            .foregroundStyle(Color.secondary)
                    }
                }
            }
            .navigationTitle("Add to Needt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: cancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            if await model.send() { finish() }
                        }
                    }
                    .disabled(!model.canSend)
                }
            }
        }
    }
}
