import SwiftUI
import Defaults

/// Unified audio visualizer view that switches between real-time and animated based on user preference
struct AudioVisualizerView: View {
    @Binding var isPlaying: Bool
    @Default(.enableRealTimeWaveform) private var enableRealTimeWaveform
    
    var body: some View {
        if enableRealTimeWaveform {
            RealTimeAudioSpectrumView(isPlaying: $isPlaying)
        } else {
            AudioSpectrumView(isPlaying: $isPlaying)
        }
    }
}

#Preview("Animated") {
    AudioVisualizerView(isPlaying: .constant(true))
        .frame(width: 16, height: 20)
        .padding()
}
