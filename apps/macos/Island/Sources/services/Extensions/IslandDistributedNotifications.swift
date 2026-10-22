import Foundation

enum IslandDistributedNotifications {
    static let didBecomeActive = Notification.Name("com.dynamicisland.app.lifecycle.didBecomeActive")
    static let didBecomeIdle = Notification.Name("com.dynamicisland.app.lifecycle.didBecomeIdle")

    enum UserInfoKey {
        static let sourcePID = "sourcePID"
    }
}
