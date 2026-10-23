import NeedtKit
import SwiftUI

/// Mac-only settings: plain system controls. Everything else is in the web
/// app's own settings.
struct SettingsView: View {
    var body: some View {
        TabView {
            FocusSettingsPane()
                .tabItem { Label("Focus", systemImage: "scope") }
            IslandSettingsPane()
                .tabItem { Label("Island", systemImage: "rectangle.topthird.inset.filled") }
            AboutSettingsPane()
                .tabItem { Label("About", systemImage: "info.circle") }
        }
        .frame(width: 500, height: 560)
    }
}

private struct AboutSettingsPane: View {
    var body: some View {
        Form {
            Section {
                LabeledContent("Version", value: Updater.versionString)
                if Updater.isAvailableInThisBuild {
                    LabeledContent("Updates") {
                        Button("Check for Updates…") { Updater.shared.checkForUpdates() }
                            .disabled(!Updater.shared.isConfigured)
                    }
                }
            } header: {
                Text("About")
            } footer: {
                if Updater.isAvailableInThisBuild {
                    Text(Updater.shared.isConfigured
                        ? "Needt checks for updates once a day."
                        : "Updates are off in this build.")
                }
            }
        }
        .formStyle(.grouped)
    }
}

private struct FocusSettingsPane: View {
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
    }
}
