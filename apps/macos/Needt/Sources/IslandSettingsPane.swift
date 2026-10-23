import AppKit
import Defaults
import SwiftUI

/// Settings, Island: plain system controls over the island's own Defaults.
/// On Free the pane is read-only with a preview and one line; there is no
/// button or link that sells anything.
struct IslandSettingsPane: View {
    @ObservedObject private var entitlement = IslandEntitlement.shared

    @Default(.needtIslandEnabled) private var enabled
    @Default(.needtModuleOrder) private var order
    @Default(.needtModulesEnabled) private var active
    @Default(.openNotchOnHover) private var openOnHover
    @Default(.minimumHoverDuration) private var hoverDelay
    @Default(.showOnAllDisplays) private var allDisplays
    @Default(.externalDisplayStyle) private var displayStyle
    @Default(.enableHaptics) private var haptics
    @Default(.playLowBatteryAlertSound) private var batterySound
    @Default(.enableLockSounds) private var lockSounds
    @Default(.lockScreenMusicFullscreenVideoArtwork) private var animatedArtwork

    private var isPro: Bool { entitlement.isPro }

    var body: some View {
        Form {
            Section {
                IslandPreview()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                if !isPro {
                    Text("Available in Pro")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Toggle("Show the island", isOn: $enabled)
            }
            .disabled(!isPro)

            Section {
                ForEach(modules, id: \.self) { module in
                    HStack {
                        Toggle(module.title, isOn: binding(for: module))
                        Spacer()
                        Button {
                            move(module, by: -1)
                        } label: {
                            Image(systemName: "chevron.up")
                        }
                        .disabled(index(of: module) == 0)
                        Button {
                            move(module, by: 1)
                        } label: {
                            Image(systemName: "chevron.down")
                        }
                        .disabled(index(of: module) == modules.count - 1)
                    }
                    .buttonStyle(.borderless)
                }
            } header: {
                Text("Modules")
            } footer: {
                Text("The first module is where the island opens. Music and Files come after.")
            }
            .disabled(!isPro || !enabled)

            Section("Opening") {
                Picker("Open the island", selection: $openOnHover) {
                    Text("On hover").tag(true)
                    Text("On click").tag(false)
                }
                if openOnHover {
                    HStack {
                        Text("Hover delay")
                        Slider(value: $hoverDelay, in: 0...1, step: 0.05)
                        Text(String(format: "%.2f s", hoverDelay))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .frame(width: 50, alignment: .trailing)
                    }
                }
            }
            .disabled(!isPro || !enabled)

            Section("Displays") {
                Toggle("Show on every display", isOn: $allDisplays)
                Toggle("Pill at top centre on screens without a notch", isOn: pillBinding)
            }
            .disabled(!isPro || !enabled)

            Section {
                // The only place Apple Music access is asked for.
                Toggle("Animated cover art from Apple Music", isOn: $animatedArtwork)
                    .onChange(of: animatedArtwork) { _, on in
                        if on { Task { _ = await AnimatedArtworkManager.shared.requestAuthorization() } }
                    }
            } header: {
                Text("Music")
            } footer: {
                Text("Off by default: the island shows the static cover. Turning this on asks macOS for access to Apple Music, only to look up the moving cover for the song that is playing.")
            }
            .disabled(!isPro || !enabled)

            Section("Feedback") {
                Toggle("Haptics", isOn: $haptics)
                Toggle("Low battery sound", isOn: $batterySound)
                Toggle("Lock and unlock sounds", isOn: $lockSounds)
                #if !APPSTORE
                // Accessibility is asked for here and never at launch.
                Button("Show volume and brightness in the island…") {
                    MediaKeyInterceptor.shared.requestAccessibilityAndStart()
                }
                #endif
            }
            .disabled(!isPro || !enabled)

            Section("About and acknowledgements") {
                Text("The island is derived from Atoll, a fork of boring.notch, both licensed under the GNU General Public License v3. Because that code ships inside this app, the source of the Needt Mac app is offered under GPL v3.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack {
                    Link("Atoll", destination: URL(string: "https://github.com/Ebullioscopic/Atoll")!)
                    Link("boring.notch", destination: URL(string: "https://github.com/TheBoredTeam/boring.notch")!)
                    Spacer()
                    Button("Show licence") { Self.reveal("LICENSE.txt") }
                    Button("Show acknowledgements") { Self.reveal("ACKNOWLEDGEMENTS.md") }
                }
                .buttonStyle(.link)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: helpers

    private var modules: [NeedtModule] {
        order + NeedtModule.allCases.filter { !order.contains($0) }
    }

    private func index(of module: NeedtModule) -> Int {
        modules.firstIndex(of: module) ?? 0
    }

    private func move(_ module: NeedtModule, by offset: Int) {
        var list = modules
        guard let from = list.firstIndex(of: module) else { return }
        let to = from + offset
        guard list.indices.contains(to) else { return }
        list.swapAt(from, to)
        order = list
    }

    private func binding(for module: NeedtModule) -> Binding<Bool> {
        Binding(
            get: { active.contains(module) },
            set: { on in
                active.removeAll { $0 == module }
                if on { active.append(module) }
            }
        )
    }

    private var pillBinding: Binding<Bool> {
        Binding(
            get: { displayStyle == .dynamicIsland },
            set: { displayStyle = $0 ? .dynamicIsland : .notch }
        )
    }

    private static func reveal(_ file: String) {
        let parts = file.split(separator: ".", maxSplits: 1).map(String.init)
        let url = parts.count == 2
            ? Bundle.main.url(forResource: parts[0], withExtension: parts[1])
            : Bundle.main.url(forResource: file, withExtension: nil)
        if let url { NSWorkspace.shared.open(url) }
    }
}

/// A still of the closed island with a focus running.
private struct IslandPreview: View {
    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().stroke(NeedtInk.track, lineWidth: 3)
                Circle().trim(from: 0, to: 0.7)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 16, height: 16)
            Text("Focus 18:04")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 16)
        .frame(height: 30)
        .background(Capsule().fill(Color.black))
    }
}
