import AppKit
import NeedtKit
import Combine

/// The menu-bar glyph: the n mark as a template image (the system tints it
/// for light, dark and a pressed item). Path from dk-chrome.jsx, 16 x 16.
enum MenuBarGlyph {
    static let image: NSImage = {
        let image = NSImage(size: NSSize(width: 16, height: 16), flipped: true) { _ in
            let p = NSBezierPath()
            p.move(to: NSPoint(x: 3, y: 13))
            p.line(to: NSPoint(x: 3, y: 3.5))
            p.line(to: NSPoint(x: 5.9, y: 3.5))
            p.line(to: NSPoint(x: 6.0, y: 4.8))
            p.curve(to: NSPoint(x: 9.6, y: 3), controlPoint1: NSPoint(x: 6.9, y: 3.7), controlPoint2: NSPoint(x: 8.1, y: 3))
            p.curve(to: NSPoint(x: 12.9, y: 6.6), controlPoint1: NSPoint(x: 11.7, y: 3), controlPoint2: NSPoint(x: 12.6, y: 4.8))
            p.line(to: NSPoint(x: 13.8, y: 13))
            p.line(to: NSPoint(x: 10.9, y: 13))
            p.line(to: NSPoint(x: 9.9, y: 7.1))
            p.curve(to: NSPoint(x: 8.5, y: 5.6), controlPoint1: NSPoint(x: 9.8, y: 6), controlPoint2: NSPoint(x: 9.3, y: 5.6))
            p.curve(to: NSPoint(x: 6.1, y: 6.7), controlPoint1: NSPoint(x: 7.6, y: 5.6), controlPoint2: NSPoint(x: 6.8, y: 6.0))
            p.line(to: NSPoint(x: 6.1, y: 13))
            p.close()
            NSColor.black.setFill()
            p.fill()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Needt"
        return image
    }()
}

/// The menu-bar item, in AppKit: an `NSStatusItem` and a native `NSMenu`.
///
/// This used to be a SwiftUI `MenuBarExtra`. SwiftUI owns the window of such a
/// scene and lets its hosting view push the content's ideal size into it on
/// every constraint pass; a label or menu that changes size when data arrives
/// then loops inside "Update Constraints in Window" until AppKit aborts the
/// app. Nothing here is a hosting view: the button title is plain text with
/// monospaced digits, the item's length is set only when the shape of the text
/// (not its digits) changes, and the menu is rebuilt each time it opens.
/// CI (scripts/check-hosting-views.py) fails on any SwiftUI scene.
@MainActor
final class StatusItemController: NSObject, NSMenuDelegate {
    static let shared = StatusItemController()

    private var item: NSStatusItem?
    private var tray: TrayStore?
    private var cancellables = Set<AnyCancellable>()
    private var ticker: Timer?
    private var lastTitle = ""
    private var lastShape = ""
    private let font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)

    private static let titleLimit = 40

    private final class Action: NSObject {
        let run: @MainActor () -> Void
        init(_ run: @escaping @MainActor () -> Void) { self.run = run }
    }

    func start(tray: TrayStore) {
        guard item == nil else { return }
        self.tray = tray
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        self.item = item
        let menu = NSMenu()
        menu.autoenablesItems = false
        menu.delegate = self
        item.menu = menu
        item.button?.image = MenuBarGlyph.image
        item.button?.imagePosition = .imageOnly
        item.button?.font = font
        item.button?.setAccessibilityLabel("Needt")
        tray.$state
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.refresh() }
            .store(in: &cancellables)
        refresh()
    }

    // MARK: the button: the icon alone, and "24:10 · task" only while a focus run exists

    private func refresh() {
        guard let tray, let button = item?.button else { return }
        let state = tray.state
        var text = ""
        var counting = false
        if let end = state.focusEndDate, end > Date() {
            counting = true
            let left = max(1, Int(ceil(end.timeIntervalSinceNow)))
            text = formatClock(left)
            if let title = FocusSync.shortTitle(state.focusTitle) { text += " · \(title)" }
        } else if state.isFocusActive {
            // Paused: no end time to count to.
            text = FocusSync.shortTitle(state.focusTitle).map { "Paused · \($0)" } ?? "Paused"
        }
        setTicking(counting)
        if text != lastTitle {
            lastTitle = text
            button.title = text
            button.imagePosition = text.isEmpty ? .imageOnly : .imageLeft
        }
        // The length is fixed per shape: every digit measures as "0", so a
        // ticking countdown never changes it.
        let shape = String(text.map { $0.isNumber ? "0" : $0 })
        if shape != lastShape {
            lastShape = shape
            if shape.isEmpty {
                item?.length = NSStatusItem.squareLength
            } else {
                let width = NSAttributedString(string: shape, attributes: [.font: font]).size().width
                item?.length = ceil(16 + 4 + width + 16)
            }
        }
    }

    private func setTicking(_ on: Bool) {
        if on, ticker == nil {
            let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.refresh() }
            }
            RunLoop.main.add(timer, forMode: .common)
            ticker = timer
        } else if !on, let timer = ticker {
            timer.invalidate()
            ticker = nil
        }
    }

    // MARK: the menu: a running focus, Today / N open, the next three tasks, then Open / Quick add / Start focus / Quit

    func menuNeedsUpdate(_ menu: NSMenu) {
        guard let tray else { return }
        menu.removeAllItems()
        let state = tray.state
        let online = Connectivity.shared.isOnline

        if !online {
            // Read-only: the last report stays visible, writes say why they are off.
            note(menu, tray.updatedAt.map { OfflineCache.note(updatedAt: $0) } ?? "Offline")
            note(menu, OfflineCache.writeDisabledReason)
            menu.addItem(.separator())
        }
        if let focus = state.focus {
            note(menu, "Focus · \(state.focusTitle ?? "Untitled")")
            note(menu, focus)
            add(menu, tray.isFocusPaused ? "Resume focus" : "Pause focus", enabled: online) { tray.togglePauseFocus() }
            add(menu, "End focus", key: ".", enabled: online) { tray.endFocus() }
            menu.addItem(.separator())
        }
        if !state.next.isEmpty {
            note(menu, "Today · \(state.open) open")
            for task in state.next {
                add(menu, label(for: task)) { AppController.shared.openTask(id: task.id) }
            }
            menu.addItem(.separator())
        }
        add(menu, "Open Needt", key: "o") { AppController.shared.showMain() }
        add(menu, "Quick add", key: " ", mods: [.command, .shift], enabled: online) { AppController.shared.showQuickAdd() }
        if state.focus == nil, let suggestion = tray.suggestion {
            add(menu, "Start focus: \(FocusSync.shortTitle(suggestion.title, max: 32) ?? "task")", enabled: online) {
                tray.startSuggested()
            }
        } else if state.focus == nil, !state.next.isEmpty {
            add(menu, "Start focus on next task", enabled: online) { tray.startFocusOnNextTask() }
        }
        if let error = tray.focusError { note(menu, error) }
        menu.addItem(.separator())
        add(menu, "Mac Settings…", key: ",", mods: [.command, .option]) { AppController.shared.showMacSettings() }
        add(menu, "Check for Updates…") { Updater.shared.checkForUpdates() }
        add(menu, "Quit Needt", key: "q") { NSApp.terminate(nil) }
    }

    private func label(for task: TrayTask) -> String {
        let title = task.title.count > Self.titleLimit
            ? String(task.title.prefix(Self.titleLimit - 1)) + "…"
            : task.title
        if let time = task.time { return "\(time)   \(title)" }
        return title
    }

    private func note(_ menu: NSMenu, _ text: String) {
        let entry = NSMenuItem(title: text, action: nil, keyEquivalent: "")
        entry.isEnabled = false
        menu.addItem(entry)
    }

    private func add(_ menu: NSMenu, _ title: String, key: String = "", mods: NSEvent.ModifierFlags = [.command],
                     enabled: Bool = true, _ run: @escaping @MainActor () -> Void) {
        let entry = NSMenuItem(title: title, action: #selector(fire(_:)), keyEquivalent: key)
        entry.keyEquivalentModifierMask = key.isEmpty ? [] : mods
        entry.target = self
        entry.isEnabled = enabled
        entry.representedObject = Action(run)
        menu.addItem(entry)
    }

    @objc private func fire(_ sender: NSMenuItem) {
        (sender.representedObject as? Action)?.run()
    }
}
