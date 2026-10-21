import SwiftUI

struct LockScreenCalendarEventRow: View {
    let line: String
    let isVisible: Bool
    let renderToken: Int
    let font: Font
    let alignment: Alignment
    let iconName: String
    let iconRenderingMode: SymbolRenderingMode
    let iconColors: [Color]

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            calendarIcon
                .frame(width: 26, height: 26)

            Text(line)
                .font(font)
                .lineLimit(1)
                .truncationMode(.tail)
                .minimumScaleFactor(0.85)
                .allowsTightening(true)
                .layoutPriority(10)
        }
        .frame(maxWidth: .infinity, alignment: alignment)
        .padding(.horizontal, 2)
        .id(renderToken)
        .opacity(isVisible ? 1 : 0)
        .accessibilityHidden(!isVisible)
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private var calendarIcon: some View {
        let baseImage = Image(systemName: iconName)
            .font(.system(size: 20, weight: .semibold))
            .id(iconRenderingModeIdentifier)

        if iconRenderingModeIdentifier.lowercased().contains("palette"), iconColors.count >= 2 {
            baseImage
                .symbolRenderingMode(.palette)
                .foregroundStyle(iconColors[0], iconColors[1])
        } else if iconColors.count >= 2 {
            baseImage
                .symbolRenderingMode(iconRenderingMode)
                .foregroundStyle(iconColors[0], iconColors[1])
        } else if iconColors.count == 1 {
            baseImage
                .symbolRenderingMode(iconRenderingMode)
                .foregroundStyle(iconColors[0])
        } else {
            baseImage
                .symbolRenderingMode(iconRenderingMode)
        }
    }

    private var iconRenderingModeIdentifier: String {
        String(describing: iconRenderingMode)
    }
}
