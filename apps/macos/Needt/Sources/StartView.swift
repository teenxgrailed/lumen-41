import NeedtKit
import SwiftUI

/// Colours of the dk-chrome spec, light and dark.
private enum Dk {
    static func ground(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 0.071, green: 0.075, blue: 0.078) : Color(red: 0.988, green: 0.992, blue: 0.996)
    }
    static func ink(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 0.976, green: 0.976, blue: 0.976) : Color(red: 0.102, green: 0.110, blue: 0.118)
    }
    static func ink2(_ scheme: ColorScheme) -> Color { ink(scheme).opacity(0.62) }
    static func ink3(_ scheme: ColorScheme) -> Color { ink(scheme).opacity(0.45) }
    static func raise(_ scheme: ColorScheme) -> Color { ink(scheme).opacity(0.07) }
    static func line(_ scheme: ColorScheme) -> Color { ink(scheme).opacity(0.14) }
    static let success = Color(red: 0.18, green: 0.62, blue: 0.36)
}

/// A button of the spec: 36 high, radius 11; primary is ink on the ground.
private struct DkButtonStyle: ButtonStyle {
    enum Kind { case plain, primary, text }
    let kind: Kind
    @Environment(\.colorScheme) private var scheme

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        switch kind {
        case .primary:
            configuration.label
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(scheme == .dark ? Color(red: 0.067, green: 0.071, blue: 0.078) : .white)
                .frame(minWidth: 200, minHeight: 40)
                .background(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(scheme == .dark ? Color.white : Color(red: 0.102, green: 0.110, blue: 0.118))
                        .opacity(pressed ? 0.82 : 1)
                )
        case .plain:
            configuration.label
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Dk.ink(scheme))
                .padding(.horizontal, 18)
                .frame(minHeight: 36)
                .background(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(Dk.raise(scheme).opacity(pressed ? 1.6 : 1))
                )
        case .text:
            configuration.label
                .font(.system(size: 13))
                .foregroundStyle(Dk.ink2(scheme).opacity(pressed ? 0.7 : 1))
                .frame(minHeight: 28)
        }
    }
}

struct StartView: View {
    @ObservedObject var auth: AuthFlow
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack(alignment: .bottom) {
            Dk.ground(scheme).ignoresSafeArea()
            VStack(spacing: 0) {
                Image("StartIcon")
                    .resizable()
                    .interpolation(.high)
                    .frame(width: 112, height: 112)
                    .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
                    .shadow(color: Color(red: 0.07, green: 0.06, blue: 0.16).opacity(0.45), radius: 22, y: 14)
                Text("Needt")
                    .font(.system(size: 40, weight: .regular))
                    .tracking(-0.8)
                    .foregroundStyle(Dk.ink(scheme))
                    .padding(.top, 22)
                    .padding(.bottom, 6)
                content
            }
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Text("Version \(Config.version) · needt.app")
                .font(.system(size: 11.5))
                .foregroundStyle(Dk.ink3(scheme))
                .padding(.bottom, 18)
        }
        .animation(.easeOut(duration: 0.18), value: auth.step)
    }

    @ViewBuilder
    private var content: some View {
        switch auth.step {
        case .start:
            lead("Tasks, calendar and docs in one place.")
            VStack(spacing: 10) {
                Button("Sign in") { auth.begin() }
                    .buttonStyle(DkButtonStyle(kind: .primary))
                Button("Create an account") { auth.begin() }
                    .buttonStyle(DkButtonStyle(kind: .text))
            }
            .padding(.top, 26)

        case .browser:
            lead("We opened your browser. Sign in there and come back — this window will pick it up.")
            VStack(alignment: .leading, spacing: 8) {
                stepRow(mark: "✓", done: true, text: "Browser opened", strong: true)
                stepRow(mark: "2", done: false, text: "Sign in with Google, Apple or email", strong: false)
                stepRow(mark: "3", done: false, text: "Return to Needt", strong: false)
            }
            .frame(maxWidth: 280, alignment: .leading)
            .padding(.top, 26)
            VStack(spacing: 10) {
                Button("Open the browser again") { auth.begin() }
                    .buttonStyle(DkButtonStyle(kind: .plain))
                Button("Cancel") { auth.cancel() }
                    .buttonStyle(DkButtonStyle(kind: .text))
            }
            .padding(.top, 26)

        case .back:
            lead("Signing you in…")
            ProgressView()
                .controlSize(.small)
                .padding(.top, 26)

        case .error:
            lead("That sign-in link expired. Try again — it only takes a second.")
            Button("Sign in again") { auth.begin() }
                .buttonStyle(DkButtonStyle(kind: .primary))
                .padding(.top, 26)
        }
    }

    private func lead(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14))
            .lineSpacing(3)
            .multilineTextAlignment(.center)
            .foregroundStyle(Dk.ink2(scheme))
            .frame(maxWidth: 270)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func stepRow(mark: String, done: Bool, text: String, strong: Bool) -> some View {
        HStack(spacing: 10) {
            Text(mark)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(done ? Color.white : Dk.ink(scheme))
                .frame(width: 20, height: 20)
                .background(Circle().fill(done ? Dk.success : Dk.raise(scheme)))
            Text(text)
                .font(.system(size: 13, weight: strong ? .medium : .regular))
                .foregroundStyle(strong ? Dk.ink(scheme) : Dk.ink2(scheme))
        }
    }
}

/// The offline screen of the spec: shown when the web app cannot be reached.
struct OfflineView: View {
    let retry: () -> Void
    @Environment(\.colorScheme) private var scheme
    /// The last day the app reported, shown read-only (no edit queue).
    private let cached = OfflineCache.shared.load(TrayState.self, for: .tray)

    var body: some View {
        ZStack {
            Dk.ground(scheme).ignoresSafeArea()
            VStack(spacing: 0) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 26, weight: .regular))
                    .foregroundStyle(Dk.ink2(scheme))
                    .frame(width: 64, height: 64)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Dk.raise(scheme)))
                Text("You’re offline")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Dk.ink(scheme))
                    .padding(.top, 18)
                    .padding(.bottom, 6)
                Text("Needt needs a connection to sign in the first time. After that it opens offline and syncs when you’re back.")
                    .font(.system(size: 14))
                    .lineSpacing(3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Dk.ink2(scheme))
                    .frame(maxWidth: 320)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 18)
                if let cached, !cached.value.next.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(OfflineCache.note(updatedAt: cached.savedAt))
                            .font(.system(size: 12))
                            .foregroundStyle(Dk.ink3(scheme))
                        ForEach(cached.value.next) { task in
                            Text(task.time.map { "\($0)   \(task.title)" } ?? task.title)
                                .font(.system(size: 13))
                                .foregroundStyle(Dk.ink2(scheme))
                                .lineLimit(1)
                        }
                        Text(OfflineCache.writeDisabledReason)
                            .font(.system(size: 12))
                            .foregroundStyle(Dk.ink3(scheme))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: 320, alignment: .leading)
                    .padding(.bottom, 18)
                }
                Button("Try again", action: retry)
                    .buttonStyle(DkButtonStyle(kind: .primary))
                Text("Retrying every 10 s")
                    .font(.system(size: 12))
                    .foregroundStyle(Dk.ink3(scheme))
                    .padding(.top, 12)
            }
            .padding(.top, 52)
        }
    }
}
