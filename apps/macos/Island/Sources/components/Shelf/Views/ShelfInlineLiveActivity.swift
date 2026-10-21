import SwiftUI

/// Standalone inline HUD shown in the closed Needt when the
/// File Tray (Shelf) has items and no higher-priority live activity is active.
///
/// Layout mirrors the battery inline HUD:
///   [tray icon] ─── [ notch ] ─── [bold green count]
struct ShelfInlineLiveActivity: View {
    @EnvironmentObject var vm: DynamicIslandViewModel
    @ObservedObject private var shelfState = ShelfStateViewModel.shared

    private let sideWidth: CGFloat = 24

    var body: some View {
        HStack(spacing: 0) {

            // LEFT of notch — tray icon (white, same style as the screenshot)
            Image(systemName: "tray.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: sideWidth, alignment: .leading)

            // Physical notch / pill space
            Rectangle()
                .fill(Color.black)
                .frame(width: vm.closedNotchSize.width)

            // RIGHT of notch — file count in white
            Text("\(shelfState.items.count)")
                .font(.system(.callout, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .contentTransition(.numericText(countsDown: false))
                .animation(.smooth(duration: 0.3), value: shelfState.items.count)
                .frame(width: sideWidth, alignment: .trailing)
        }
        .frame(height: vm.effectiveClosedNotchHeight, alignment: .center)
    }
}
