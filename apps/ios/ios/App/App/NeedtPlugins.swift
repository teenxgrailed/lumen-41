import UIKit
import AuthenticationServices
import Capacitor

/// Capacitor 6+ no longer auto-registers plugins that live in the app target:
/// the root view controller registers them (capacitorDidLoad).
class NeedtViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NeedtAppIconPlugin())
        bridge?.registerPluginInstance(NeedtAuthPlugin())
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
