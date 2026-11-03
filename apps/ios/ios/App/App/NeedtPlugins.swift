import UIKit
import AuthenticationServices
import StoreKit
import Capacitor

/// Capacitor 6+ no longer auto-registers plugins that live in the app target:
/// the root view controller registers them (capacitorDidLoad). It also puts
/// the native offline screen (OfflineScreen.swift) in front of the web view
/// when the main page cannot load.
class NeedtViewController: CAPBridgeViewController {
    private var offline: OfflineCoordinator?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NeedtAppIconPlugin())
        bridge?.registerPluginInstance(NeedtAuthPlugin())
        bridge?.registerPluginInstance(NeedtStorePlugin())
        if let webView = webView {
            let coordinator = OfflineCoordinator(host: self, webView: webView)
            coordinator.install()
            offline = coordinator
        }
    }
}

/// `window.Capacitor.Plugins.NeedtAppIcon`: alternate home-screen icons.
/// `name` is the asset set name ("AppIcon-ink"); null / missing is the primary
/// icon (Midnight). The names must be listed in
/// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES (project.pbxproj).
@objc(NeedtAppIconPlugin)
public class NeedtAppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeedtAppIconPlugin"
    public let jsName = "NeedtAppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getIcon", returnType: CAPPluginReturnPromise),
    ]

    @objc func setIcon(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else {
                call.reject("Alternate icons are not supported")
                return
            }
            if app.alternateIconName == name {
                call.resolve(["name": name as Any])
                return
            }
            app.setAlternateIconName(name) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["name": name as Any])
                }
            }
        }
    }

    @objc func getIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["name": UIApplication.shared.alternateIconName as Any])
        }
    }
}

/// `window.Capacitor.Plugins.NeedtAuth.start({ url, callbackScheme })`: runs a
/// sign-in in the system browser (ASWebAuthenticationSession), because Google
/// refuses embedded WebViews. Resolves `{ url }` with the callback link
/// (needt://auth?code=...); rejects with code "cancelled" when the person
/// closes the sheet.
@objc(NeedtAuthPlugin)
public class NeedtAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "NeedtAuthPlugin"
    public let jsName = "NeedtAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"),
              let url = URL(string: raw),
              url.scheme == "https",
              let scheme = call.getString("callbackScheme"), !scheme.isEmpty else {
            call.reject("Invalid sign-in request")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.session = nil
                if let callback = callback {
                    call.resolve(["url": callback.absoluteString])
                    return
                }
                if let err = error as? ASWebAuthenticationSessionError, err.code == .canceledLogin {
                    call.reject("Sign-in was cancelled", "cancelled")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not open the sign-in sheet")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

/// `window.Capacitor.Plugins.NeedtStore`: StoreKit 2 purchases for Needt Pro.
///
/// The plugin never decides what a purchase is worth: it only hands verified
/// signed transactions (JWS) to the web, which posts them to the server and
/// calls `finish` after a 2xx. Nothing is finished here on its own, so a
/// transaction the server never accepted comes back on the next launch.
///
/// - `products({ ids })` -> `{ products: [...] }`
/// - `purchase({ id, appAccountToken })` -> `{ status: "success" | "pending" |
///   "cancelled" | "failed", signedTransaction, productId, transactionId, message }`
/// - `finish({ transactionId })` -> `{ finished }`
/// - `restore()` -> `{ transactions: [...] }` after `AppStore.sync()`
/// - `entitlements()` -> `{ transactions: [...] }` without sync
/// - `pendingTransactions()` -> `{ transactions: [...] }`: verified updates
///   (renewals, Ask to Buy approvals, purchases made elsewhere) that were not
///   finished yet; each is also sent as the `transactionUpdated` event
/// - `manageSubscriptions()` -> the system subscription sheet
///
/// Only `VerificationResult.verified` transactions leave this class.
@objc(NeedtStorePlugin)
public class NeedtStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NeedtStorePlugin"
    public let jsName = "NeedtStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise),
    ]

    /// Verified transactions not finished yet, by transaction id.
    private var unfinished: [UInt64: Transaction] = [:]
    /// Updates (not purchases made in the app) waiting for `finish`, so
    /// `pendingTransactions` can replay them when the web was not listening.
    private var pendingPayloads: [UInt64: [String: Any]] = [:]
    private let lock = NSLock()
    private var updatesTask: Task<Void, Never>?

    /// Called once when the bridge registers the plugin, i.e. at app launch.
    override public func load() {
        startUpdatesListener()
    }

    deinit {
        updatesTask?.cancel()
    }

    // Not async, so it is safe to call from async code (NSLock is not).
    private func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    // MARK: - Transaction.updates

    private func startUpdatesListener() {
        guard updatesTask == nil else { return }
        updatesTask = Task.detached(priority: .background) { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                guard case .verified(let transaction) = result else { continue }
                let payload = self.payload(for: transaction, jws: result.jwsRepresentation)
                self.remember(transaction, payload: payload, pending: true)
                self.notifyListeners("transactionUpdated", data: payload)
            }
        }
    }

    private func remember(_ transaction: Transaction, payload: [String: Any], pending: Bool) {
        locked {
            unfinished[transaction.id] = transaction
            if pending { pendingPayloads[transaction.id] = payload }
        }
    }

    private func payload(for transaction: Transaction, jws: String) -> [String: Any] {
        return [
            "signedTransaction": jws,
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
        ]
    }

    // MARK: - Products

    @objc func products(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self) ?? []).filter { !$0.isEmpty }
        guard !ids.isEmpty else {
            call.resolve(["products": [Any]()])
            return
        }
        Task {
            do {
                let found = try await Product.products(for: ids)
                // keep the order the caller asked for
                let sorted = found.sorted {
                    (ids.firstIndex(of: $0.id) ?? Int.max) < (ids.firstIndex(of: $1.id) ?? Int.max)
                }
                call.resolve(["products": sorted.map { NeedtStorePlugin.describe($0) }])
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }

    private static func describe(_ product: Product) -> [String: Any] {
        var out: [String: Any] = [
            "id": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "price": "\(product.price)",
            "currencyCode": product.priceFormatStyle.currencyCode,
            "isFamilyShareable": product.isFamilyShareable,
        ]
        switch product.type {
        case .autoRenewable: out["type"] = "autoRenewable"
        case .nonConsumable: out["type"] = "nonConsumable"
        case .consumable: out["type"] = "consumable"
        case .nonRenewable: out["type"] = "nonRenewable"
        default: out["type"] = "unknown"
        }
        if let sub = product.subscription {
            out["period"] = describe(sub.subscriptionPeriod)
            if let intro = sub.introductoryOffer {
                var offer: [String: Any] = [
                    "displayPrice": intro.displayPrice,
                    "price": "\(intro.price)",
                    "period": describe(intro.period),
                    "periodCount": intro.periodCount,
                ]
                if intro.paymentMode == .freeTrial {
                    offer["paymentMode"] = "freeTrial"
                } else if intro.paymentMode == .payAsYouGo {
                    offer["paymentMode"] = "payAsYouGo"
                } else if intro.paymentMode == .payUpFront {
                    offer["paymentMode"] = "payUpFront"
                }
                out["introOffer"] = offer
            }
        }
        return out
    }

    private static func describe(_ period: Product.SubscriptionPeriod) -> [String: Any] {
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "unknown"
        }
        return ["unit": unit, "value": period.value]
    }

    // MARK: - Purchase / finish

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.resolve(["status": "failed", "message": "Missing product id"])
            return
        }
        var options: Set<Product.PurchaseOption> = []
        if let raw = call.getString("appAccountToken") {
            guard let token = UUID(uuidString: raw) else {
                call.resolve(["status": "failed", "message": "Invalid account token"])
                return
            }
            options.insert(.appAccountToken(token))
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.resolve(["status": "failed", "message": "Product not found"])
                    return
                }
                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        let payload = self.payload(for: transaction, jws: verification.jwsRepresentation)
                        self.remember(transaction, payload: payload, pending: false)
                        var out = payload
                        out["status"] = "success"
                        call.resolve(out)
                    case .unverified(_, let error):
                        call.resolve(["status": "failed", "message": "Purchase could not be verified: \(error.localizedDescription)"])
                    }
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "failed", "message": "Unknown purchase result"])
                }
            } catch {
                call.resolve(["status": "failed", "message": error.localizedDescription])
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let raw = call.getString("transactionId"), let id = UInt64(raw) else {
            call.reject("Invalid transaction id", "invalid")
            return
        }
        Task {
            var found = self.locked { self.unfinished[id] }
            if found == nil {
                // the app restarted since the transaction was handed to the web
                for await result in Transaction.unfinished {
                    if case .verified(let t) = result, t.id == id {
                        found = t
                        break
                    }
                }
            }
            guard let transaction = found else {
                call.resolve(["finished": false])
                return
            }
            await transaction.finish()
            self.locked {
                self.unfinished[id] = nil
                self.pendingPayloads[id] = nil
            }
            call.resolve(["finished": true])
        }
    }

    // MARK: - Restore / entitlements / pending

    private func currentEntitlements() async -> [[String: Any]] {
        var out: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            out.append(payload(for: transaction, jws: result.jwsRepresentation))
        }
        return out
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                if case StoreKitError.userCancelled = error {
                    call.reject("Restore was cancelled", "cancelled")
                } else {
                    call.reject(error.localizedDescription, "failed")
                }
                return
            }
            call.resolve(["transactions": await self.currentEntitlements()])
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(["transactions": await self.currentEntitlements()])
        }
    }

    @objc func pendingTransactions(_ call: CAPPluginCall) {
        let items = locked { Array(pendingPayloads.values) }
        call.resolve(["transactions": items])
    }

    // MARK: - Manage

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            let scene = self.bridge?.viewController?.view.window?.windowScene
                ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            guard let scene = scene else {
                call.reject("No active window", "unavailable")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }
}
