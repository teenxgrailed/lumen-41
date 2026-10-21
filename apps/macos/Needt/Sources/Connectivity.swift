import Foundation
import Network

/// Whether the network is reachable, from the system's path monitor (events,
/// no polling). The menu bar and Quick add use it to turn writes off.
@MainActor
final class Connectivity: ObservableObject {
    static let shared = Connectivity()

    @Published private(set) var isOnline = true
    private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.isOnline = online }
        }
        monitor.start(queue: DispatchQueue(label: "app.needt.mac.connectivity"))
    }
}
