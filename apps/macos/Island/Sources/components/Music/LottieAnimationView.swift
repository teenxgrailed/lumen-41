import SwiftUI
import Lottie
import LottieUI
import Defaults

#if APPSTORE
// Mac App Store build: nothing is downloaded for the visualizer. The default
// animation lived on lottiefiles.com and custom ones are remote URLs, so only
// a visualizer stored on this Mac is drawn.
struct LottieAnimationView: View {
    @Default(.selectedVisualizer) var selectedVisualizer
    var body: some View {
        if let visualizer = selectedVisualizer, visualizer.url.isFileURL {
            LottieView(
                state: LUStateData(
                    type: .loadedFrom(visualizer.url),
                    speed: visualizer.speed,
                    loopMode: .loop
                )
            )
        } else {
            Color.clear
        }
    }
}
#else
struct LottieAnimationView: View {
    let state1 = LUStateData(type: .loadedFrom(URL(string: "https://assets9.lottiefiles.com/packages/lf20_mniampqn.json")!), speed: 1.0, loopMode: .loop)
    @Default(.selectedVisualizer) var selectedVisualizer
    var body: some View {
        if selectedVisualizer == nil {
            LottieView(state: state1)
        } else {
            LottieView(
                state: LUStateData(
                    type: .loadedFrom(selectedVisualizer!.url),
                    speed: selectedVisualizer!.speed,
                    loopMode: .loop
                )
            )
        }
    }
}
#endif

#Preview {
    LottieAnimationView()
}
