import Carbon.HIToolbox
import Foundation

/// A system-wide shortcut (⇧⌘Space for quick add). Carbon's hot-key API needs
/// no Accessibility or Input Monitoring permission.
final class GlobalHotKey {
    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?
    private static var actions: [UInt32: () -> Void] = [:]
    private static var nextID: UInt32 = 1

    /// Returns nil when another app already owns the combination; that must
    /// not stop the app.
    init?(keyCode: Int, modifiers: Int, action: @escaping () -> Void) {
        let id = GlobalHotKey.nextID
        GlobalHotKey.nextID += 1
        GlobalHotKey.actions[id] = action

        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let installed = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, _ in
                var hotKeyID = EventHotKeyID()
                let status = GetEventParameter(
                    event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                    nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID
                )
                if status == noErr, let action = GlobalHotKey.actions[hotKeyID.id] {
                    DispatchQueue.main.async { action() }
                }
                return noErr
            },
            1, &spec, nil, &handlerRef
        )
        guard installed == noErr else { return nil }

        let hotKeyID = EventHotKeyID(signature: OSType(0x4E45_4454), id: id)
        let registered = RegisterEventHotKey(
            UInt32(keyCode), UInt32(modifiers), hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef
        )
        guard registered == noErr else { return nil }
    }

    deinit {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let handlerRef { RemoveEventHandler(handlerRef) }
    }
}
