import AppKit

/// The application menu: the same items and shortcuts as the Tauri app. Custom
/// items call things the web app already has (its routes, the composer, the
/// sidebar) through `AppController.sendCommand`; Edit, Window, Hide and Full
/// Screen are the system's own.
@MainActor
final class MainMenuBuilder: NSObject, NSMenuItemValidation {
    static let shared = MainMenuBuilder()

    private func item(
        _ title: String,
        _ action: Selector?,
        key: String = "",
        modifiers: NSEvent.ModifierFlags = .command,
        target: AnyObject? = nil
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        item.target = target
        return item
    }

    private func submenu(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem {
        let menu = NSMenu(title: title)
        for entry in items { menu.addItem(entry) }
        let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        holder.submenu = menu
        return holder
    }

    func build() -> NSMenu {
        let main = NSMenu(title: "Main")

        // Needt
        main.addItem(submenu("Needt", [
            item("About Needt", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), target: NSApp),
            .separator(),
            item("Check for Updates…", #selector(checkForUpdates), target: self),
            item("Settings…", #selector(openSettings), key: ",", target: self),
            .separator(),
            item("Hide Needt", #selector(NSApplication.hide(_:)), key: "h", target: NSApp),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), key: "h", modifiers: [.command, .option], target: NSApp),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:)), target: NSApp),
            .separator(),
            item("Quit Needt", #selector(NSApplication.terminate(_:)), key: "q", target: NSApp),
        ]))

        // File
        main.addItem(submenu("File", [
            item("New Task", #selector(newTask), key: "n", target: self),
            item("New Doc", #selector(newDoc), key: "n", modifiers: [.command, .option], target: self),
            item("Quick Add", #selector(quickAdd), key: " ", modifiers: [.command, .shift], target: self),
            .separator(),
            item("Close Window", #selector(NSWindow.performClose(_:)), key: "w"),
        ]))

        // Edit
        main.addItem(submenu("Edit", [
            item("Undo", Selector(("undo:")), key: "z"),
            item("Redo", Selector(("redo:")), key: "z", modifiers: [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), key: "x"),
            item("Copy", #selector(NSText.copy(_:)), key: "c"),
            item("Paste", #selector(NSText.paste(_:)), key: "v"),
            item("Select All", #selector(NSText.selectAll(_:)), key: "a"),
        ]))

        // View
        main.addItem(submenu("View", [
            item("Today", #selector(goToday), key: "1", target: self),
            item("Calendar", #selector(goCalendar), key: "2", target: self),
            item("Tasks", #selector(goTasks), key: "3", target: self),
            item("Docs", #selector(goDocs), key: "4", target: self),
            .separator(),
            item("Toggle Sidebar", #selector(toggleSidebar), key: "\\", target: self),
            .separator(),
            item("Reload", #selector(reload), key: "r", target: self),
            item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), key: "f", modifiers: [.command, .control]),
        ]))

        // Window
        let window = submenu("Window", [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), key: "m"),
            item("Zoom", #selector(NSWindow.performZoom(_:))),
        ])
        main.addItem(window)
        NSApp.windowsMenu = window.submenu

        // Help
        main.addItem(submenu("Help", [
            item("Needt Website", #selector(openWebsite), target: self),
        ]))

        return main
    }

    // MARK: actions

    @objc private func checkForUpdates() { Updater.shared.checkForUpdates() }
    @objc private func openSettings() { AppController.shared.sendCommand(["type": "settings"]) }
    @objc private func newTask() { AppController.shared.sendCommand(["type": "new-task"]) }
    @objc private func newDoc() { AppController.shared.sendCommand(["type": "new-doc"]) }
    @objc private func quickAdd() { AppController.shared.showQuickAdd() }
    @objc private func goToday() { AppController.shared.navigate("/today") }
    @objc private func goCalendar() { AppController.shared.navigate("/calendar") }
    @objc private func goTasks() { AppController.shared.navigate("/tasks") }
    @objc private func goDocs() { AppController.shared.navigate("/pages") }
    @objc private func toggleSidebar() { AppController.shared.sendCommand(["type": "toggle-sidebar"]) }
    @objc private func reload() { AppController.shared.reload() }
    @objc private func openWebsite() { AppController.shared.openWebsite() }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        if menuItem.action == #selector(checkForUpdates) { return Updater.shared.isConfigured }
        return true
    }
}
