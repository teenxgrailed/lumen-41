import AppKit
import Combine
import Defaults
import NeedtKit
import SwiftUI

/// Borderless, always on top, non-activating. It takes keyboard focus only
/// while the island is open (to type a task), and still does not activate Needt.
final class IslandV3Panel: NSPanel {
    var keyAllowed = false

    override init(contentRect: NSRect, styleMask style: NSWindow.StyleMask, backing: NSWindow.BackingStoreType, defer flag: Bool) {
        super.init(contentRect: contentRect, styleMask: [.borderless, .nonactivatingPanel], backing: backing, defer: flag)
        isFloatingPanel = true
        hidesOnDeactivate = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        isMovable = false
        animationBehavior = .none
        isReleasedWhenClosed = false
        level = .mainMenu + 3
        collectionBehavior = [.fullScreenAuxiliary, .canJoinAllSpaces, .ignoresCycle, .stationary]
    }

    override var canBecomeKey: Bool { keyAllowed }
    override var canBecomeMain: Bool { false }
}

/// Hosts the SwiftUI island. The window is sized from code, so the hosting
/// view must not push its ideal size back into it (see the CI guard).
final class IslandV3HostView: NSHostingView<IslandV3View> {
    weak var model: IslandV3Model?
    var onScroll: ((NSEvent) -> Void)?
    var onDragEnter: (() -> Void)?
    var onDragExit: (() -> Void)?
    var onDrop: (([URL]) -> Bool)?

    required init(rootView: IslandV3View) {
        super.init(rootView: rootView)
        sizingOptions = []
        registerForDraggedTypes([.fileURL])
    }

    @MainActor @preconcurrency required dynamic init?(coder: NSCoder) { nil }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(
            rect: .zero,
            options: [.mouseMoved, .mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self, userInfo: nil
        ))
    }

    override func mouseMoved(with event: NSEvent) {
        MainActor.assumeIsolated { model?.pointerMoved(NSEvent.mouseLocation) }
    }

    override func mouseExited(with event: NSEvent) {
        MainActor.assumeIsolated { model?.pointerMoved(NSEvent.mouseLocation) }
    }

    override func scrollWheel(with event: NSEvent) { onScroll?(event) }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        onDragEnter?()
        return .copy
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }

    override func draggingExited(_ sender: NSDraggingInfo?) { onDragExit?() }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = sender.draggingPasteboard.readObjects(
            forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]
        ) as? [URL] ?? []
        return onDrop?(urls) ?? false
    }
}

/// One island on one screen: its own model, window and host. The first display
/// is the primary one (it owns the feed); the others mirror its data and prefs.
@MainActor
final class IslandV3Display {
    var screen: NSScreen
    let model: IslandV3Model
    let panel: IslandV3Panel
    let host: IslandV3HostView
    var shrinkWork: DispatchWorkItem?

    init(screen: NSScreen, model: IslandV3Model, panel: IslandV3Panel, host: IslandV3HostView) {
        self.screen = screen
        self.model = model
        self.panel = panel
        self.host = host
    }
}

/// Owns the island's windows and everything outside SwiftUI: the screens, the
/// pointer monitors, Esc and outside clicks, the drag of files toward it.
@MainActor
final class IslandV3Controller {
    static let shared = IslandV3Controller()

    private var displays: [IslandV3Display] = []
    private var feed: IslandV3Feed?
    private var tray: TrayStore?
    private var visible = true
    private var currentChoice = IslandPrefs.Displays.builtIn
    private var mirrorLinks: [AnyCancellable] = []
    private var monitors: [Any] = []
    private var observers: [NSObjectProtocol] = []
    private var dragPasteboardCount = -1
    private var fileDragActive = false

    private static let margin: CGFloat = 48

    var isRunning: Bool { !displays.isEmpty }
    /// The primary display's model.
    var model: IslandV3Model? { displays.first?.model }
    private var models: [IslandV3Model] { displays.map(\.model) }

    // MARK: start / stop

    func start(tray: TrayStore) {
        if !displays.isEmpty {
            if visible { displays.forEach { $0.panel.orderFrontRegardless() } }
            return
        }
        #if APPSTORE
        // Music in the App Store build is Apple Music and Spotify only.
        let kind = Defaults[.mediaController]
        if kind != .appleMusic && kind != .spotify { Defaults[.mediaController] = .appleMusic }
        #endif
        self.tray = tray
        guard buildDisplays(choice: currentChoice) else { return }
        let feed = IslandV3Feed(model: displays[0].model, tray: tray)
        self.feed = feed
        wireMirrors()

        installMonitors()
        observeScreens()
        displays[0].model.start()
        feed.start()
    }

    func stop() {
        removeMonitors()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        feed?.stop()
        tearDownDisplays()
        feed = nil
    }

    /// The web settings "Show the island" (islandShow) and "Displays"
    /// (islandDisplays: built-in | all | main).
    func apply(prefs: IslandPrefs) {
        visible = prefs.show
        if prefs.displays != currentChoice, !displays.isEmpty {
            currentChoice = prefs.displays
            rebuildDisplays()
        }
        currentChoice = prefs.displays
        setVisible(prefs.show)
    }

    func setVisible(_ visible: Bool) {
        self.visible = visible
        for d in displays {
            if visible { d.panel.orderFrontRegardless() } else { d.panel.orderOut(nil) }
        }
    }

    /// Open a file given to the Dock icon or "Open with Needt": it goes to the Shelf.
    func addToShelf(_ urls: [URL]) {
        guard let model else { return }
        _ = handleDrop(urls, model: model)
    }

    // MARK: screens and windows

    /// The screen with the camera housing, else the main one.
    private static func builtInScreen() -> NSScreen? {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main ?? NSScreen.screens.first
    }

    /// Screens to cover for a Displays choice; the first is the primary.
    private static func targetScreens(for choice: IslandPrefs.Displays) -> [NSScreen] {
        switch choice {
        case .builtIn:
            return builtInScreen().map { [$0] } ?? []
        case .main:
            return (NSScreen.screens.first ?? NSScreen.main).map { [$0] } ?? []
        case .all:
            guard let primary = builtInScreen() else { return [] }
            return [primary] + NSScreen.screens.filter { $0 != primary }
        }
    }

    @discardableResult
    private func buildDisplays(choice: IslandPrefs.Displays) -> Bool {
        let screens = Self.targetScreens(for: choice)
        guard !screens.isEmpty, let tray else { return false }
        for (index, screen) in screens.enumerated() {
            let model = IslandV3Model(metrics: IslandV3Metrics.measure(screen))
            let view = IslandV3HostView(rootView: IslandV3View(model: model))
            view.model = model
            let panel = IslandV3Panel(contentRect: .zero, styleMask: [], backing: .buffered, defer: false)
            panel.contentView = view
            let display = IslandV3Display(screen: screen, model: model, panel: panel, host: view)
            displays.append(display)

            model.tray = tray
            model.onWillChange = { [weak self, weak display] size in
                guard let self, let display else { return }
                self.place(display, for: size, growOnly: true)
            }
            model.onWantsKey = { [weak display] wants in
                guard let display else { return }
                display.panel.keyAllowed = wants
                if wants { display.panel.makeKey() } else if display.panel.isKeyWindow { display.panel.resignKey() }
            }
            view.onScroll = { [weak self, weak display] event in
                guard let self, let display else { return }
                self.handleScroll(event, model: display.model)
            }
            view.onDragEnter = { [weak model] in model?.dragNear(true) }
            view.onDragExit = { [weak model] in model?.dragNear(false) }
            view.onDrop = { [weak self, weak model] urls in
                guard let self, let model else { return false }
                return self.handleDrop(urls, model: model)
            }
            place(display, for: model.targetSize, growOnly: false)
            if visible { panel.orderFrontRegardless() }
            if index > 0 { model.start() }
        }
        return true
    }

    private func tearDownDisplays() {
        mirrorLinks.removeAll()
        for d in displays {
            d.shrinkWork?.cancel()
            d.model.stop()
            d.panel.orderOut(nil)
            d.panel.close()
        }
        displays.removeAll()
    }

    /// Secondary screens show the primary's data and prefs and repeat its
    /// moments. [unverified] Hover and open state are each screen's own.
    private func wireMirrors() {
        mirrorLinks.removeAll()
        guard let primary = displays.first?.model else { return }
        let others = displays.dropFirst().map(\.model)
        for other in others {
            other.feed = feed
            mirrorLinks.append(primary.$data.sink { [weak other] in other?.data = $0 })
            mirrorLinks.append(primary.$prefs.sink { [weak other] in other?.prefs = $0 })
        }
        primary.onMoment = others.isEmpty ? nil : { mode in others.forEach { $0.moment(mode) } }
    }

    /// The Displays choice changed: new windows, same feed (it keeps writing
    /// to the primary model, so the feed is restarted on the new one).
    private func rebuildDisplays() {
        let oldPrefs = displays.first?.model.prefs ?? IslandPrefs()
        let oldData = displays.first?.model.data ?? IslandV3Data()
        feed?.stop()
        tearDownDisplays()
        guard buildDisplays(choice: currentChoice), let tray else { return }
        displays[0].model.prefs = oldPrefs
        displays[0].model.data = oldData
        let feed = IslandV3Feed(model: displays[0].model, tray: tray)
        self.feed = feed
        wireMirrors()
        displays[0].model.start()
        feed.start()
    }

    private func observeScreens() {
        let token = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.screensChanged() }
        }
        observers.append(token)
    }

    private func screensChanged() {
        let wanted = Self.targetScreens(for: currentChoice)
        if wanted.count != displays.count || zip(wanted, displays).contains(where: { $0.0 != $0.1.screen }) {
            if wanted.count == 1, displays.count == 1 {
                let d = displays[0]
                d.screen = wanted[0]
                d.model.metrics = IslandV3Metrics.measure(wanted[0])
                place(d, for: d.model.targetSize, growOnly: false)
            } else {
                rebuildDisplays()
            }
            return
        }
        for d in displays {
            d.model.metrics = IslandV3Metrics.measure(d.screen)
            place(d, for: d.model.targetSize, growOnly: false)
        }
    }

    /// Positions the window around the shape's target size, centred at the top
    /// of the screen. Growing is immediate (so nothing is clipped while the
    /// shape springs); shrinking waits for the spring to settle.
    private func place(_ display: IslandV3Display, for size: IslandV3Size, growOnly: Bool) {
        let panel = display.panel, screen = display.screen, model = display.model
        let m = model.metrics
        let topGap: CGFloat = m.hasNotch ? 0 : 6
        let width = (size.width * 1.07).rounded(.up) + 2 * Self.margin
        let height = size.height + topGap + Self.margin
        var frame = NSRect(
            x: (screen.frame.midX - width / 2).rounded(),
            y: screen.frame.maxY - height,
            width: width, height: height
        )
        let shape = CGRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - topGap - size.height,
            width: size.width, height: size.height
        )
        model.shapeScreenRect = shape
        model.screenTopCentre = CGPoint(x: screen.frame.midX, y: screen.frame.maxY)

        display.shrinkWork?.cancel()
        if growOnly {
            frame = frame.union(panel.frame)
            panel.setFrame(frame, display: false)
            let work = DispatchWorkItem { [weak self, weak display] in
                guard let self, let display else { return }
                self.place(display, for: display.model.targetSize, growOnly: false)
            }
            display.shrinkWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: work)
        } else {
            panel.setFrame(frame, display: false)
        }
    }

    // MARK: pointer, keys, outside clicks, file drags

    private func installMonitors() {
        func add(global mask: NSEvent.EventTypeMask, _ handler: @escaping (NSEvent) -> Void) {
            if let m = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: handler) { monitors.append(m) }
        }
        func local(_ mask: NSEvent.EventTypeMask, _ handler: @escaping (NSEvent) -> NSEvent?) {
            if let m = NSEvent.addLocalMonitorForEvents(matching: mask, handler: handler) { monitors.append(m) }
        }

        // Proximity needs the pointer outside the window too. A tracking area
        // only reports inside its own window, so the same signal is also taken
        // from a mouse-moved monitor; no permission is needed for mouse position.
        add(global: [.mouseMoved]) { [weak self] _ in
            Task { @MainActor in self?.models.forEach { $0.pointerMoved(NSEvent.mouseLocation) } }
        }
        local([.mouseMoved]) { [weak self] event in
            MainActor.assumeIsolated { self?.models.forEach { $0.pointerMoved(NSEvent.mouseLocation) } }
            return event
        }

        // A click anywhere else collapses the open island.
        add(global: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in self?.models.forEach { $0.collapse() } }
        }
        local([.leftMouseDown, .rightMouseDown]) { [weak self] event in
            MainActor.assumeIsolated {
                guard let self else { return }
                for model in self.models where model.shapeMode == .open {
                    if !model.shapeScreenRect.contains(NSEvent.mouseLocation) { model.collapse() }
                }
            }
            return event
        }

        // Esc collapses; Option+Space starts "Add a task" while open.
        local([.keyDown]) { [weak self] event in
            var swallow = false
            MainActor.assumeIsolated {
                guard let model = self?.models.first(where: { $0.shapeMode == .open }) else { return }
                if event.keyCode == 53 {
                    if model.addState == .idle { model.collapse(); swallow = true }
                } else if event.keyCode == 49, event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .option {
                    model.select(tab: .today)
                    model.beginAdd()
                    swallow = true
                }
            }
            return swallow ? nil : event
        }

        // A file dragged toward the island: it stretches and says "Drop to Shelf".
        add(global: [.leftMouseDragged]) { [weak self] _ in
            Task { @MainActor in self?.fileDragMoved() }
        }
        local([.leftMouseDragged]) { [weak self] event in
            MainActor.assumeIsolated { self?.fileDragMoved() }
            return event
        }
        add(global: [.leftMouseUp]) { [weak self] _ in
            Task { @MainActor in self?.fileDragEnded() }
        }
        local([.leftMouseUp]) { [weak self] event in
            MainActor.assumeIsolated { self?.fileDragEnded() }
            return event
        }
    }

    private func removeMonitors() {
        monitors.forEach { NSEvent.removeMonitor($0) }
        monitors.removeAll()
    }

    private func fileDragMoved() {
        guard model != nil else { return }
        let board = NSPasteboard(name: .drag)
        let carriesFiles = board.canReadObject(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true])
        if !fileDragActive {
            guard carriesFiles, board.changeCount != dragPasteboardCount else { return }
            dragPasteboardCount = board.changeCount
            fileDragActive = true
            models.forEach { $0.dragBegan() }
        }
        let p = NSEvent.mouseLocation
        for model in models {
            let dx = p.x - model.screenTopCentre.x
            let dy = model.screenTopCentre.y - p.y
            let near = hypot(dx, dy) < 190
            model.dragNear(near)
            let lean = near ? max(-14, min(14, dx * 0.08)) : 0
            if abs(lean - model.lean) > 0.3 { model.lean = lean }
        }
    }

    private func fileDragEnded() {
        guard fileDragActive else { return }
        fileDragActive = false
        // The drop handler runs first when the file lands on the island; if it
        // did not, put the island back.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            for model in self?.models ?? [] {
                model.dragEnded()
                if model.shapeMode == .drop { model.dragNear(false) }
                model.lean = 0
            }
        }
    }

    private func handleScroll(_ event: NSEvent, model: IslandV3Model) {
        guard model.shapeScreenRect.contains(NSEvent.mouseLocation) else { return }
        let dy = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.scrollingDeltaY * 8
        model.scrolled(deltaY: dy)
    }

    private func handleDrop(_ urls: [URL], model: IslandV3Model) -> Bool {
        let files = urls.filter(\.isFileURL)
        guard !files.isEmpty else { return false }
        let name = files[0].lastPathComponent + (files.count > 1 ? " and \(files.count - 1) more" : "")
        Task { @MainActor in
            let items = await ShelfDropService.items(from: files)
            guard !items.isEmpty else { return }
            ShelfStateViewModel.shared.add(items)
        }
        model.dropped(name: name)
        return true
    }
}
