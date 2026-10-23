import AppIntents
import NeedtKit
import SwiftUI
import WidgetKit

/// D · Ink, Quick add: widgets have no text field, so this only launches the
/// app on the capture screen (never a fake input). Small, the lab's prompt
/// variant, the Lock Screen circle, and the round Control face.
struct InkQuickAdd: View {
    @Environment(\.needt) private var c
    var model: QuickAddModel
    var layout: QuickAddLayout = .open

    var body: some View {
        switch c.family {
        case .circular: circular
        case .control: controlFace
        default: small
        }
    }

    private var small: some View {
        Button(intent: OpenQuickAddIntent()) { content }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .signedOut:
            StateCenter(symbol: "plus", title: "Sign in to add tasks", detail: nil)
        case .offline:
            StateCenter(symbol: "icloud.slash", title: "Add a task", detail: "Saved, syncs when online")
        case .ready:
            if layout == .prompt { prompt } else { StateCenter(symbol: "plus", title: "Add a task", detail: "Opens Needt") }
        }
    }

    /// Lab D10: a hint line and an Add pill. Still a button, not a field.
    private var prompt: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Quick add").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
            Spacer(minLength: 0)
            Text("Pay rent Friday 15 min").font(c.fonts.t13()).foregroundStyle(c.palette.a3).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 40, alignment: .leading).frame(maxWidth: .infinity, alignment: .leading)
                .inkWell(radius: 20)
            HStack { Spacer(); InkButtonLabel(symbol: "plus", title: "Add") }.padding(.top, 8)
        }
    }

    private var circular: some View {
        Image(systemName: "plus").font(.system(size: 24, weight: .semibold)).foregroundStyle(c.palette.ink)
    }

    /// The face of the round Control (lab D9).
    private var controlFace: some View {
        Image(systemName: "plus").font(.system(size: 20, weight: .semibold)).foregroundStyle(c.palette.ink)
            .frame(width: 50, height: 50).background(Circle().fill(c.palette.card))
    }
}
