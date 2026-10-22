import AppKit

/// Runtime-resolved window-server calls. Every function is looked up lazily and every
/// caller has a public-API fallback, so a missing symbol only disables the extra behaviour.
enum SystemBridge {
    private static let handle: UnsafeMutableRawPointer? = dlopen(
        "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY)

    private static func symbol<T>(_ name: String, as _: T.Type) -> T? {
        guard let p = dlsym(handle ?? UnsafeMutableRawPointer(bitPattern: -2), name) else { return nil }
        return unsafeBitCast(p, to: T.self)
    }

    typealias ConnectionFn = @convention(c) () -> Int32
    typealias SpaceCreateFn = @convention(c) (Int32, Int32, Int32) -> Int32
    typealias SpaceLevelFn = @convention(c) (Int32, Int32, Int32) -> Int32
    typealias SpacesFn = @convention(c) (Int32, CFArray) -> Int32
    typealias SpaceDestroyFn = @convention(c) (Int32, Int32) -> Int32
    typealias MoveWindowsFn = @convention(c) (Int32, Int32, CFArray, Int32) -> Int32
    typealias AddWindowsFn = @convention(c) (Int32, CFArray, CFArray) -> Void

    static let connection = symbol("SLSMainConnectionID", as: ConnectionFn.self)
    static let spaceCreate = symbol("SLSSpaceCreate", as: SpaceCreateFn.self)
    static let spaceSetLevel = symbol("SLSSpaceSetAbsoluteLevel", as: SpaceLevelFn.self)
    static let showSpaces = symbol("SLSShowSpaces", as: SpacesFn.self)
    static let hideSpaces = symbol("SLSHideSpaces", as: SpacesFn.self)
    static let spaceDestroy = symbol("SLSSpaceDestroy", as: SpaceDestroyFn.self)
    static let moveWindows = symbol("SLSSpaceAddWindowsAndRemoveFromSpaces", as: MoveWindowsFn.self)
    static let addWindows = symbol("SLSAddWindowsToSpaces", as: AddWindowsFn.self)
    static let removeWindows = symbol("SLSRemoveWindowsFromSpaces", as: AddWindowsFn.self)

    typealias ScreenWatcherFn = @convention(c) () -> Bool
    typealias NotifyProc = @convention(c) (Int32, Int32, Int32, UnsafeMutableRawPointer?) -> Void
    typealias RegisterNotifyFn = @convention(c) (NotifyProc?, Int32, UnsafeMutableRawPointer?) -> Bool

    static let screenWatcherPresent = symbol("CGSIsScreenWatcherPresent", as: ScreenWatcherFn.self)
    static let registerNotify = symbol("CGSRegisterNotifyProc", as: RegisterNotifyFn.self)
}

/// Shows a window above the lock screen by moving it into a dedicated top-level space.
final class WindowLayerBridge {
    static let shared = WindowLayerBridge()
    private var space: Int32?

    private init() {}

    func attach(_ window: NSWindow, retries: Int = 20) {
        guard let conn = SystemBridge.connection?(),
              let create = SystemBridge.spaceCreate,
              let setLevel = SystemBridge.spaceSetLevel,
              let show = SystemBridge.showSpaces,
              let move = SystemBridge.moveWindows else { return }

        guard window.windowNumber > 0 else {
            guard retries > 0 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self, weak window] in
                guard let window else { return }
                self?.attach(window, retries: retries - 1)
            }
            return
        }

        if space == nil {
            let s = create(conn, 1, 0)
            _ = setLevel(conn, s, 400)
            _ = show(conn, [s] as CFArray)
            space = s
        }
        if let s = space {
            _ = move(conn, s, [window.windowNumber] as CFArray, 7)
        }
    }
}

/// Keeps the notch windows above everything, on every space.
final class NotchWindowSet {
    private var spaceID: Int32?

    var windows: Set<NSWindow> = [] {
        didSet {
            let removed = oldValue.subtracting(windows)
            let added = windows.subtracting(oldValue)

            if let conn = SystemBridge.connection?(), let create = SystemBridge.spaceCreate,
               let setLevel = SystemBridge.spaceSetLevel, let show = SystemBridge.showSpaces,
               let add = SystemBridge.addWindows, let remove = SystemBridge.removeWindows {
                if spaceID == nil {
                    let s = create(conn, 1, 0)
                    _ = setLevel(conn, s, Int32.max)
                    _ = show(conn, [s] as CFArray)
                    spaceID = s
                }
                if let s = spaceID {
                    remove(conn, removed.map { $0.windowNumber } as CFArray, [s] as CFArray)
                    add(conn, added.map { $0.windowNumber } as CFArray, [s] as CFArray)
                }
            }
            for window in added {
                window.level = .screenSaver
                window.collectionBehavior.formUnion([.canJoinAllSpaces, .fullScreenAuxiliary, .stationary])
            }
        }
    }

    deinit {
        guard let conn = SystemBridge.connection?(), let s = spaceID else { return }
        _ = SystemBridge.hideSpaces?(conn, [s] as CFArray)
        _ = SystemBridge.spaceDestroy?(conn, s)
    }
}
