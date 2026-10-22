import AppKit
import NeedtKit
import SwiftUI

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

/// The item in the menu bar: the icon alone, and "24:10 · task" only while a
/// focus run exists. The countdown is the system's own `Text(timerInterval:)`,
/// so nothing here ticks; the label is rebuilt when the state changes.
struct MenuBarLabel: View {
    @ObservedObject var tray: TrayStore

    var body: some View {
        let state = tray.state
        HStack(spacing: 4) {
            Image(nsImage: MenuBarGlyph.image)
            if let end = state.focusEndDate, end > Date() {
                HStack(spacing: 3) {
                    Text(timerInterval: Date()...end, countsDown: true, showsHours: false)
                        .monospacedDigit()
                        .frame(width: 40, alignment: .leading)
                    if let title = FocusSync.shortTitle(state.focusTitle) {
                        Text("· \(title)")
                    }
                }
            } else if state.isFocusActive {
                // Paused: no end time to count to.
                Text(FocusSync.shortTitle(state.focusTitle).map { "Paused · \($0)" } ?? "Paused")
            }
        }
    }
}

/// The menu: a running focus, Today · N open, the next three tasks, then
/// Open / Quick add / Start focus / Quit. Native menu: text and shortcuts.
struct MenuBarContent: View {
    @ObservedObject var tray: TrayStore
    @ObservedObject private var net = Connectivity.shared

    private static let titleLimit = 40

    private func label(for task: TrayTask) -> String {
        let title = task.title.count > Self.titleLimit
            ? String(task.title.prefix(Self.titleLimit - 1)) + "…"
            : task.title
        if let time = task.time { return "\(time)   \(title)" }
        return title
    }

    var body: some View {
        let state = tray.state
        let online = net.isOnline
        if !online {
            // Read-only: the last report stays visible, writes say why they are off.
            Text(tray.updatedAt.map { OfflineCache.note(updatedAt: $0) } ?? "Offline")
            Text(OfflineCache.writeDisabledReason)
            Divider()
        }
        if let focus = state.focus {
            Text("Focus · \(state.focusTitle ?? "Untitled")")
            Text(focus)
            Button(tray.isFocusPaused ? "Resume focus" : "Pause focus") {
                tray.togglePauseFocus()
            }
            .disabled(!online)
            Button("End focus") {
                tray.endFocus()
            }
            .keyboardShortcut(".", modifiers: .command)
            .disabled(!online)
            Divider()
        }

        if !state.next.isEmpty {
            Text("Today · \(state.open) open")
            ForEach(state.next) { task in
                Button(label(for: task)) {
                    AppController.shared.openTask(id: task.id)
                }
            }
            Divider()
        }

        Button("Open Needt") {
            AppController.shared.showMain()
        }
        .keyboardShortcut("o", modifiers: .command)
        Button("Quick add") {
            AppController.shared.showQuickAdd()
        }
        .keyboardShortcut(.space, modifiers: [.command, .shift])
        .disabled(!online)
        if state.focus == nil, let suggestion = tray.suggestion {
            Button("Start focus: \(FocusSync.shortTitle(suggestion.title, max: 32) ?? "task")") {
                tray.startSuggested()
            }
            .disabled(!online)
        } else if state.focus == nil, !state.next.isEmpty {
            Button("Start focus on next task") {
                tray.startFocusOnNextTask()
            }
            .disabled(!online)
        }
        if let error = tray.focusError {
            Text(error)
        }
        Divider()
        Button("Mac Settings…") {
            AppController.shared.showMacSettings()
        }
        .keyboardShortcut(",", modifiers: [.command, .option])
        Button("Quit Needt") {
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q", modifiers: .command)
    }
}
