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

/// Owns the island's window and everything outside SwiftUI: the screen, the
/// pointer monitors, Esc and outside clicks, the drag of files toward it.
@MainActor
final class IslandV3Controller {
    static let shared = IslandV3Controller()

    private(set) var model: IslandV3Model?
    private var feed: IslandV3Feed?
    private var panel: IslandV3Panel?
    private var host: IslandV3HostView?
    private var screen: NSScreen?
    private var monitors: [Any] = []
    private var observers: [NSObjectProtocol] = []
    private var shrinkWork: DispatchWorkItem?
    private var dragPasteboardCount = -1
    private var fileDragActive = false

    private static let margin: CGFloat = 48

    var isRunning: Bool { panel != nil }

    // MARK: start / stop

    func start(tray: TrayStore) {
        if panel != nil {
            panel?.orderFrontRegardless()
            return
        }
        #if APPSTORE
        // Music in the App Store build is Apple Music and Spotify only.
        let kind = Defaults[.mediaController]
        if kind != .appleMusic && kind != .spotify { Defaults[.mediaController] = .appleMusic }
        #endif
        guard let target = Self.targetScreen() else { return }
        screen = target
        let model = IslandV3Model(metrics: IslandV3Metrics.measure(target))
        self.model = model
        let feed = IslandV3Feed(model: model, tray: tray)
        self.feed = feed

        let view = IslandV3HostView(rootView: IslandV3View(model: model))
        view.model = model
        let panel = IslandV3Panel(contentRect: .zero, styleMask: [], backing: .buffered, defer: false)
        panel.contentView = view
        self.panel = panel
        self.host = view

        model.onWillChange = { [weak self] size in self?.place(for: size, growOnly: true) }
        model.onWantsKey = { [weak self] wants in self?.setKey(wants) }
        view.onScroll = { [weak self] event in self?.handleScroll(event) }
        view.onDragEnter = { [weak model] in model?.dragNear(true) }
        view.onDragExit = { [weak model] in model?.dragNear(false) }
        view.onDrop = { [weak self] urls in self?.handleDrop(urls) ?? false }

        place(for: model.targetSize, growOnly: false)
        panel.orderFrontRegardless()
        installMonitors()
        observeScreens()
        model.start()
        feed.start()
    }

    func stop() {
        removeMonitors()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        feed?.stop()
        model?.stop()
        panel?.orderOut(nil)
        panel?.close()
        panel = nil
        host = nil
        model = nil
        feed = nil
    }

    /// The web setting "Show the island" (prefs.island.show).
    func setVisible(_ visible: Bool) {
        if visible { panel?.orderFrontRegardless() } else { panel?.orderOut(nil) }
    }

    /// Open a file given to the Dock icon or "Open with Needt": it goes to the Shelf.
    func addToShelf(_ urls: [URL]) {
        _ = handleDrop(urls)
    }

    // MARK: screen and window

    private static func targetScreen() -> NSScreen? {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main ?? NSScreen.screens.first
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
        guard let model, let target = Self.targetScreen() else { return }
        screen = target
        model.metrics = IslandV3Metrics.measure(target)
        place(for: model.targetSize, growOnly: false)
    }

    /// Positions the window around the shape's target size, centred at the top
    /// of the screen. Growing is immediate (so nothing is clipped while the
    /// shape springs); shrinking waits for the spring to settle.
    private func place(for size: IslandV3Size, growOnly: Bool) {
        guard let panel, let screen, let model else { return }
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

        shrinkWork?.cancel()
        if growOnly {
            frame = frame.union(panel.frame)
            panel.setFrame(frame, display: false)
            let work = DispatchWorkItem { [weak self] in
                guard let self, let model = self.model else { return }
                self.place(for: model.targetSize, growOnly: false)
            }
            shrinkWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: work)
        } else {
            panel.setFrame(frame, display: false)
        }
    }

    private func setKey(_ wants: Bool) {
        guard let panel else { return }
        panel.keyAllowed = wants
        if wants { panel.makeKey() } else if panel.isKeyWindow { panel.resignKey() }
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
            Task { @MainActor in self?.model?.pointerMoved(NSEvent.mouseLocation) }
        }
        local([.mouseMoved]) { [weak self] event in
            MainActor.assumeIsolated { self?.model?.pointerMoved(NSEvent.mouseLocation) }
            return event
        }

        // A click anywhere else collapses the open island.
        add(global: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in self?.model?.collapse() }
        }
        local([.leftMouseDown, .rightMouseDown]) { [weak self] event in
            MainActor.assumeIsolated {
                guard let self, let model = self.model, model.shapeMode == .open else { return }
                if !model.shapeScreenRect.contains(NSEvent.mouseLocation) { model.collapse() }
            }
            return event
        }

        // Esc collapses; Option+Space starts "Add a task" while open.
        local([.keyDown]) { [weak self] event in
            var swallow = false
            MainActor.assumeIsolated {
                guard let model = self?.model, model.shapeMode == .open else { return }
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
        guard let model else { return }
        let board = NSPasteboard(name: .drag)
        let carriesFiles = board.canReadObject(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true])
        if !fileDragActive {
            guard carriesFiles, board.changeCount != dragPasteboardCount else { return }
            dragPasteboardCount = board.changeCount
            fileDragActive = true
            model.dragBegan()
        }
        let p = NSEvent.mouseLocation
        let dx = p.x - model.screenTopCentre.x
        let dy = model.screenTopCentre.y - p.y
        let near = hypot(dx, dy) < 190
        model.dragNear(near)
        let lean = near ? max(-14, min(14, dx * 0.08)) : 0
        if abs(lean - model.lean) > 0.3 { model.lean = lean }
    }

    private func fileDragEnded() {
        guard fileDragActive else { return }
        fileDragActive = false
        // The drop handler runs first when the file lands on the island; if it
        // did not, put the island back.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let model = self?.model else { return }
            model.dragEnded()
            if model.shapeMode == .drop { model.dragNear(false) }
            model.lean = 0
        }
    }

    private func handleScroll(_ event: NSEvent) {
        guard let model, model.shapeScreenRect.contains(NSEvent.mouseLocation) else { return }
        let dy = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.scrollingDeltaY * 8
        model.scrolled(deltaY: dy)
    }

    private func handleDrop(_ urls: [URL]) -> Bool {
        let files = urls.filter(\.isFileURL)
        guard !files.isEmpty, let model else { return false }
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
