import NeedtKit
import SwiftUI

/// Mac-only settings: plain system controls. Everything else is in the web
/// app's own settings.
struct SettingsView: View {
    @AppStorage(FocusBridge.Keys.startShortcut) private var startShortcut = ""
    @AppStorage(FocusBridge.Keys.endShortcut) private var endShortcut = ""

    var body: some View {
        Form {
            Section {
                TextField("When focus starts", text: $startShortcut, prompt: Text("Shortcut name"))
                TextField("When focus ends", text: $endShortcut, prompt: Text("Shortcut name"))
            } header: {
                Text("Focus")
            } footer: {
                Text("Needt runs these Shortcuts when a focus run starts or ends. Make one in the Shortcuts app with the Set Focus action, then type its name here. To go the other way, add the Needt filter to a Focus in System Settings.")
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
    }
}
