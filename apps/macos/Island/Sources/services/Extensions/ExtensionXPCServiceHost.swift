import AppKit
import Foundation

/// Shared constants for the Needt island extension XPC service.
enum ExtensionXPCServiceConstants {
    static let machServiceName = "com.dynamicisland.app.xpc"
}

@MainActor
final class ExtensionXPCServiceHost: NSObject, NSXPCListenerDelegate {
    static let shared = ExtensionXPCServiceHost()

    private final class ClientContext {
        weak var connection: NSXPCConnection?
        let bundleIdentifier: String

        init(connection: NSXPCConnection, bundleIdentifier: String) {
            self.connection = connection
            self.bundleIdentifier = bundleIdentifier
        }
    }

    private var listener: NSXPCListener?
    private var clientContexts: [ObjectIdentifier: ClientContext] = [:]

    func start() {
        guard listener == nil else { return }

        // In UI testing environments (like CI), the mach-services entitlement might be stripped
        // to bypass amfid ad-hoc signing crashes. Starting the listener without the entitlement crashes the app.
        if AppRuntimeEnvironment.isUITesting {
            Logger.log("Bypassing Needt XPC listener for UI testing", category: .extensions)
            return
        }

        let listener = NSXPCListener(machServiceName: ExtensionXPCServiceConstants.machServiceName)
        listener.delegate = self
        self.listener = listener
        listener.resume()

        Logger.log("Started Needt XPC listener", category: .extensions)
    }

    func stop() {
        listener?.invalidate()
        listener = nil
        clientContexts.removeAll()
        Logger.log("Stopped Needt XPC listener", category: .extensions)
    }

    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection connection: NSXPCConnection) -> Bool {
        guard let bundleIdentifier = resolveBundleIdentifier(for: connection) else {
            Logger.log("Rejected XPC connection without bundle identifier", category: .extensions)
            return false
        }

        let service = ExtensionXPCService(bundleIdentifier: bundleIdentifier, host: self, connection: connection)
        connection.exportedInterface = NSXPCInterface(with: IslandXPCServiceProtocol.self)
        connection.exportedObject = service
        connection.remoteObjectInterface = NSXPCInterface(with: IslandXPCClientProtocol.self)

        connection.invalidationHandler = { [weak self, weak connection] in
            guard let connection else { return }
            Task { @MainActor [weak self] in
                self?.removeConnection(connection)
            }
        }

        connection.interruptionHandler = { [weak self, weak connection] in
            guard let connection else { return }
            Task { @MainActor [weak self] in
                self?.removeConnection(connection)
            }
        }

        connection.resume()
        clientContexts[ObjectIdentifier(connection)] = ClientContext(connection: connection, bundleIdentifier: bundleIdentifier)
        Logger.log("Accepted XPC connection from \(bundleIdentifier)", category: .extensions)
        return true
    }

    func notifyAuthorizationChange(bundleIdentifier: String, isAuthorized: Bool) {
        deliver(to: bundleIdentifier) { client in
            client.authorizationDidChange(isAuthorized: isAuthorized)
        }
    }

    func notifyActivityDismiss(bundleIdentifier: String, activityID: String) {
        deliver(to: bundleIdentifier) { client in
            client.activityDidDismiss(activityID: activityID)
        }
    }

    func notifyWidgetDismiss(bundleIdentifier: String, widgetID: String) {
        deliver(to: bundleIdentifier) { client in
            client.widgetDidDismiss(widgetID: widgetID)
        }
    }

    func notifyNotchExperienceDismiss(bundleIdentifier: String, experienceID: String) {
        deliver(to: bundleIdentifier) { client in
            client.notchExperienceDidDismiss(experienceID: experienceID)
        }
    }

    private func resolveBundleIdentifier(for connection: NSXPCConnection) -> String? {
        let processIdentifier = connection.processIdentifier
        guard processIdentifier != 0 else { return nil }

        if let app = NSRunningApplication(processIdentifier: pid_t(processIdentifier)),
           let bundleIdentifier = app.bundleIdentifier {
            return bundleIdentifier
        }

        return nil
    }

    private func deliver(to bundleIdentifier: String, send block: (IslandXPCClientProtocol) -> Void) {
        var staleIdentifiers: [ObjectIdentifier] = []

        for (identifier, context) in clientContexts where context.bundleIdentifier == bundleIdentifier {
            guard let connection = context.connection else {
                staleIdentifiers.append(identifier)
                continue
            }

            guard let client = connection.remoteObjectProxyWithErrorHandler({ error in
                Logger.log("Failed to deliver XPC callback to \(bundleIdentifier): \(error)", category: .extensions)
            }) as? IslandXPCClientProtocol else {
                continue
            }

            block(client)
        }

        staleIdentifiers.forEach { clientContexts.removeValue(forKey: $0) }
    }

    private func removeConnection(_ connection: NSXPCConnection) {
        clientContexts.removeValue(forKey: ObjectIdentifier(connection))
        Logger.log("Removed XPC connection", category: .extensions)
    }
}
