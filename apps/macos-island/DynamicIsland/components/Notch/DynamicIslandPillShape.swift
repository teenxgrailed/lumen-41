import SwiftUI

/// A pill-shaped (capsule-like) clip shape used for the Dynamic Island mode
/// on external and non-notched displays. Uses `.continuous` rounded corners
/// for an Apple-style squircle appearance, inspired by DynamicNotchKit's
/// floating style.
struct DynamicIslandPillShape: Shape {
    var cornerRadius: CGFloat

    var animatableData: CGFloat {
        get { cornerRadius }
        set { cornerRadius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let resolvedRadius = min(cornerRadius, min(rect.width, rect.height) / 2)
        return Path(roundedRect: rect, cornerRadius: resolvedRadius, style: .continuous)
    }
}

#Preview {
    VStack(spacing: 20) {
        DynamicIslandPillShape(cornerRadius: 16)
            .fill(.black)
            .frame(width: 185, height: 32)

        DynamicIslandPillShape(cornerRadius: 24)
            .fill(.black)
            .frame(width: 640, height: 200)
    }
    .padding(20)
}
