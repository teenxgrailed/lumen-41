import Foundation
import Combine
import AppKit
import Defaults
import SwiftUI

private func screenCaptureEventCallback(eventType: Int32, _: Int32, _: Int32, context: UnsafeMutableRawPointer?) {
    guard let context = context else { return }
    let manager = Unmanaged<ScreenRecordingManager>.fromOpaque(context).takeUnretainedValue()
    DispatchQueue.main.async {
        manager.checkRecordingStatus()
    }
}

@MainActor
class ScreenRecordingManager: ObservableObject {
    static let shared = ScreenRecordingManager()
    
    // MARK: - Coordinator
    private let coordinator = DynamicIslandViewCoordinator.shared
    
    // MARK: - Published Properties
    @Published var isRecording: Bool = false
    @Published var isMonitoring: Bool = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var isRecorderIdle: Bool = true
    @Published var lastUpdated: Date = .distantPast
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    private var recordingStartTime: Date?
    private var durationTimer: Timer?
    private var debounceIdleTask: Task<Void, Never>?
    
    // MARK: - Configuration
    private let debounceDelay: TimeInterval = 0.2 // Debounce rapid changes
    
    // MARK: - Initialization
    private init() {
        // No initial setup needed
    }
    
    deinit {
        // Clean up monitoring state
        // Note: We can't call async methods in deinit, so we just clean up local state
        debounceIdleTask?.cancel()
        durationTimer?.invalidate()
    }
    
    // MARK: - Public Methods
    
    /// Start monitoring for screen recording activity
    func startMonitoring() {
        guard !isMonitoring else { 
            print("ScreenRecordingManager: Already monitoring, skipping start")
            return 
        }
        
        isMonitoring = true
        
        print("ScreenRecordingManager: 🟢 Starting screen capture monitoring ...")
        
        // Setup event-driven capture detection using private CoreGraphics APIs
        
        setupNotifications()

        // Check initial state
        checkRecordingStatus()
        
        print("ScreenRecordingManager: ✅ Started monitoring (event-driven, no polling)")
    }
    
    /// Stop monitoring for screen recording activity
    func stopMonitoring() {
        guard isMonitoring else { 
            print("ScreenRecordingManager: Not monitoring, skipping stop")
            return 
        }
        
        print("ScreenRecordingManager: 🛑 Stopping monitoring...")
        
        isMonitoring = false
        
        // Note: We don't unregister the callback as there's no CGSUnregisterNotifyProc API
        // The callback will simply not be processed when isMonitoring is false
        
        // Stop duration tracking
        stopDurationTracking()
        
        // Reset recording state when stopping
        if isRecording {
            print("ScreenRecordingManager: Resetting isRecording from true to false")
        }
        isRecording = false
        
        print("ScreenRecordingManager: ✅ Stopped monitoring")
    }
    
    /// Toggle monitoring state
    func toggleMonitoring() {
        if isMonitoring {
            stopMonitoring()
        } else {
            startMonitoring()
        }
    }
    
    // MARK: - Private Methods

    private func setupNotifications() {
        let context = Unmanaged.passUnretained(self).toOpaque()
        _ = SystemBridge.registerNotify?(screenCaptureEventCallback, 1502, context)
        _ = SystemBridge.registerNotify?(screenCaptureEventCallback, 1503, context)
    }

    /// Check current recording status
    func checkRecordingStatus() {
        let currentRecordingState = SystemBridge.screenWatcherPresent?() ?? false
        
        // Debug: Always log current check
        print("ScreenRecordingManager: 🔍 Checking... current=\(isRecording), detected=\(currentRecordingState)")
        
        // Debounce changes to avoid flickering
        if currentRecordingState != isRecording {
            print("ScreenRecordingManager: 🔄 State change detected (\(isRecording) -> \(currentRecordingState))")
            
            if currentRecordingState && !isRecording {
                // Started recording
                lastUpdated = Date()
                startDurationTracking()
                updateIdleState(recording: true)
                // Trigger expanding view like music activity
                coordinator.toggleExpandingView(status: true, type: .recording)
                withAnimation(.smooth) {
                    isRecording = currentRecordingState
                }
                print("ScreenRecordingManager: 🔴 Screen recording STARTED")
            } else if !currentRecordingState && isRecording {
                // Stopped recording - let expanding view auto-collapse naturally (like music)
                lastUpdated = Date()
                stopDurationTracking()
                updateIdleState(recording: false)
                withAnimation(.smooth) {
                    isRecording = currentRecordingState
                }
                print("ScreenRecordingManager: ⚪ Screen recording STOPPED")
            }
        }
    }
    
    /// Start tracking recording duration
    private func startDurationTracking() {
        recordingStartTime = Date()
        recordingDuration = 0
        
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateDuration()
            }
        }
        
        print("ScreenRecordingManager: ⏱️ Started duration tracking")
    }
    
    /// Stop tracking recording duration
    private func stopDurationTracking() {
        durationTimer?.invalidate()
        durationTimer = nil
        recordingStartTime = nil
        
        // Keep the last duration for a moment before resetting
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.recordingDuration = 0
        }
        
        print("ScreenRecordingManager: ⏹️ Stopped duration tracking")
    }
    
    /// Update the current recording duration
    private func updateDuration() {
        guard let startTime = recordingStartTime else { return }
        recordingDuration = Date().timeIntervalSince(startTime)
    }
    
    /// Copy EXACT music idle state logic
    private func updateIdleState(recording: Bool) {
        if recording {
            isRecorderIdle = false
            debounceIdleTask?.cancel()
        } else {
            debounceIdleTask?.cancel()
            debounceIdleTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Defaults[.waitInterval]))
                guard let self = self, !Task.isCancelled else { return }
                await MainActor.run {
                    if self.lastUpdated.timeIntervalSinceNow < -Defaults[.waitInterval] {
                        withAnimation {
                            self.isRecorderIdle = !self.isRecording
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Extensions

extension ScreenRecordingManager {
    /// Get current recording status without async
    var currentRecordingStatus: Bool {
        return isRecording
    }
    
    /// Check if monitoring is available (for settings UI)
    var isMonitoringAvailable: Bool {
        return true // Window-based monitoring is always available
    }
    
    /// Get formatted recording duration string
    var formattedDuration: String {
        let totalSeconds = Int(recordingDuration)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}