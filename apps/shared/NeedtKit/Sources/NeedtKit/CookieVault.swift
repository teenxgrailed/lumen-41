import Foundation
#if canImport(Security)
import Security
#endif

/// Where the vault keeps its bytes.
public protocol VaultStorage: Sendable {
    func read() -> Data?
    func write(_ data: Data) -> Bool
    func delete()
}

/// A file (0600). In the app this lives in the App Group container, which the
/// sandbox keeps private to the app and its extensions.
public final class FileVaultStorage: VaultStorage, @unchecked Sendable {
    private let url: URL
    public init(url: URL) { self.url = url }

    public func read() -> Data? { try? Data(contentsOf: url) }

    public func write(_ data: Data) -> Bool {
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
            return true
        } catch {
            return false
        }
    }

    public func delete() { try? FileManager.default.removeItem(at: url) }
}

#if canImport(Security)
/// A generic-password item in the shared keychain access group.
public final class KeychainVaultStorage: VaultStorage, @unchecked Sendable {
    private let service: String
    private let account: String
    private let group: String?

    public init(service: String = "app.needt.session", account: String = "cookies", group: String?) {
        self.service = service
        self.account = account
        self.group = group
    }

    private func query() -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    public func read() -> Data? {
        var q = query()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    public func write(_ data: Data) -> Bool {
        let update = SecItemUpdate(query() as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return true }
        var add = query()
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    public func delete() { SecItemDelete(query() as CFDictionary) }
}
#endif

/// The session cookies of the signed-in person, copied out of the app's web
/// view so the Share extension and App Intents can call the API. The keychain
/// is preferred; when it is unavailable (an unsigned build has no access
/// group) the file in the shared container is used.
public struct CookieVault: Sendable {
    private let primary: VaultStorage?
    private let fallback: VaultStorage
    private let hostSuffixes: [String]

    public init(primary: VaultStorage?, fallback: VaultStorage, hostSuffixes: [String] = ["needt.app"]) {
        self.primary = primary
        self.fallback = fallback
        self.hostSuffixes = hostSuffixes
    }

    /// The vault the app and its extensions use.
    public static var shared: CookieVault {
        #if canImport(Security)
        let keychain: VaultStorage? = SharedContainer.keychainGroup.map { KeychainVaultStorage(group: $0) }
        #else
        let keychain: VaultStorage? = nil
        #endif
        return CookieVault(
            primary: keychain,
            fallback: FileVaultStorage(url: SharedContainer.directory().appendingPathComponent("session.json"))
        )
    }

    struct Entry: Codable, Equatable {
        var name: String
        var value: String
        var domain: String
        var path: String
        var expires: Double?
        var secure: Bool
    }

    private func keep(_ cookie: HTTPCookie) -> Bool {
        let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
        return hostSuffixes.contains { domain == $0 || domain.hasSuffix("." + $0) }
    }

    /// Saves the needt.app cookies (nothing else leaves the web view).
    /// Returns false when there was nothing to save or no storage took it.
    @discardableResult
    public func store(_ cookies: [HTTPCookie]) -> Bool {
        let entries = cookies.filter(keep).map {
            Entry(name: $0.name, value: $0.value, domain: $0.domain, path: $0.path,
                  expires: $0.expiresDate?.timeIntervalSince1970, secure: $0.isSecure)
        }
        guard !entries.isEmpty else { return false }
        guard let data = try? JSONEncoder().encode(entries) else { return false }
        if let primary, primary.write(data) {
            fallback.delete()
            return true
        }
        return fallback.write(data)
    }

    /// Unexpired cookies, or empty when nobody is signed in.
    public func load(now: Date = Date()) -> [HTTPCookie] {
        guard let data = primary?.read() ?? fallback.read(),
              let entries = try? JSONDecoder().decode([Entry].self, from: data)
        else { return [] }
        return entries.compactMap { e in
            if let expires = e.expires, Date(timeIntervalSince1970: expires) <= now { return nil }
            var props: [HTTPCookiePropertyKey: Any] = [
                .name: e.name, .value: e.value, .domain: e.domain, .path: e.path,
            ]
            if let expires = e.expires { props[.expires] = Date(timeIntervalSince1970: expires) }
            if e.secure { props[.secure] = "TRUE" }
            return HTTPCookie(properties: props)
        }
    }

    public func clear() {
        primary?.delete()
        fallback.delete()
    }
}
