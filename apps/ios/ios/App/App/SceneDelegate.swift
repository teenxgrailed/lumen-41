import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var webView: WKWebView? { (window?.rootViewController as? CAPBridgeViewController)?.webView }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NeedtViewController()
        window?.makeKeyAndVisible()

        WidgetBridge.shared.start()
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // A widget or Control that launched the app.
        if let url = connectionOptions.urlContexts.first?.url {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                WidgetBridge.shared.open(url, in: self?.webView)
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts where context.url.scheme == "needt" {
            if WidgetBridge.shared.open(context.url, in: webView) { continue }
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        WidgetBridge.shared.sceneDidBecomeActive(webView: webView)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        WidgetBridge.shared.sceneWillResignActive()
    }
}
