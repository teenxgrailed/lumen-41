import Foundation
import SwiftUI
import AppKit

// MARK: - Models

struct BluetoothAudioDevice: Identifiable {
    let id: UUID
    let name: String
    let address: String
    let batteryLevel: Int?  // 0-100, nil if not available
    let deviceType: BluetoothAudioDeviceType

    init(
        id: UUID = UUID(),
        name: String,
        address: String,
        batteryLevel: Int?,
        deviceType: BluetoothAudioDeviceType
    ) {
        self.id = id
        self.name = name
        self.address = address
        self.batteryLevel = batteryLevel
        self.deviceType = deviceType
    }
}

struct AirPodsListeningModeEvent: Identifiable {
    let id = UUID()
    let device: BluetoothAudioDevice
    let mode: AirPodsListeningMode
}

enum AirPodsListeningMode: Equatable {
    case noiseCancellation
    case transparency
    case adaptive
    case conversationAwareness
    case off

    var displayName: String {
        switch self {
        case .noiseCancellation:
            return "Noise Cancellation"
        case .transparency:
            return "Transparency"
        case .adaptive:
            return "Adaptive Audio"
        case .conversationAwareness:
            return "Conversation Awareness"
        case .off:
            return "Off"
        }
    }

    var sfSymbol: String {
        switch self {
        case .noiseCancellation:
            return "ear.badge.waveform"
        case .transparency:
            return "ear"
        case .adaptive:
            return "waveform"
        case .conversationAwareness:
            return "person.wave.2"
        case .off:
            return "airpods.pro"
        }
    }

    static func fromHUDSymbol(_ symbol: String) -> AirPodsListeningMode? {
        switch symbol {
        case "ear.badge.waveform", "airpods.mode.noise-cancellation":
            return .noiseCancellation
        case "ear", "airpods.mode.transparency":
            return .transparency
        case "waveform", "airpods.mode.adaptive":
            return .adaptive
        case "person.wave.2", "airpods.mode.conversation-awareness":
            return .conversationAwareness
        case "airpods.pro", "airpods.mode.off":
            return .off
        default:
            return nil
        }
    }

    static func from(userInfo: [AnyHashable: Any]?) -> AirPodsListeningMode? {
        guard let userInfo else { return nil }

        let modeKeys = [
            "listeningMode",
            "ListeningMode",
            "noiseControlMode",
            "NoiseControlMode",
            "activeNoiseControlMode",
            "ANCMode",
            "ancMode",
            "adaptiveAudioMode",
            "AdaptiveAudioMode",
            "conversationAwareness",
            "ConversationAwareness",
            "conversationDetect",
            "ConversationDetect"
        ]

        for key in modeKeys {
            if let value = userInfo[key], let mode = from(value) {
                return mode
            }
        }

        return from(userInfo.map { "\($0.key)=\($0.value)" }.joined(separator: " "))
    }

    static func from(_ value: Any) -> AirPodsListeningMode? {
        if let mode = value as? AirPodsListeningMode {
            return mode
        }

        if let number = value as? NSNumber {
            return fromPrivateValue(number.intValue)
        }

        if let string = value as? String {
            return from(string)
        }

        return from("\(value)")
    }

    static func fromPrivateValue(_ value: Int) -> AirPodsListeningMode? {
        switch value {
        case 0:
            return .off
        case 1:
            return .noiseCancellation
        case 2:
            return .transparency
        case 3:
            return .adaptive
        case 4:
            return .conversationAwareness
        default:
            return nil
        }
    }

    private static func from(_ rawValue: String) -> AirPodsListeningMode? {
        let value = rawValue.lowercased()

        if value.contains("lsnm anc") || value.contains("listeningmode anc") || value == "anc" {
            return .noiseCancellation
        }

        if value.contains("lsnm transparency") || value == "transparency" {
            return .transparency
        }

        if value.contains("lsnm autoanc") || value.contains("autoanc") {
            return .adaptive
        }

        if value.contains("lsnm normal") || value == "normal" {
            return .off
        }

        if value.contains("conversation") || value.contains("conversational") {
            return .conversationAwareness
        }

        if value.contains("adaptive") {
            return .adaptive
        }

        if value.contains("transparency") || value.contains("transparent") || value.contains("ambient") {
            return .transparency
        }

        if value.contains("noise cancellation") ||
           value.contains("noisecancellation") ||
           value.contains("noise cancelling") ||
           value.contains("noisecancelling") ||
           value.contains("anc") {
            return .noiseCancellation
        }

        if value.contains("listeningmode = 0") ||
           value.contains("listeningmode=0") ||
           value.contains("noisecontrolmode = 0") ||
           value.contains("noisecontrolmode=0") ||
           value.contains(" off") ||
           value.hasSuffix("off") {
            return .off
        }

        return nil
    }
}

extension BluetoothAudioDevice {
    func withBatteryLevel(_ batteryLevel: Int?) -> BluetoothAudioDevice {
        BluetoothAudioDevice(
            id: id,
            name: name,
            address: address,
            batteryLevel: batteryLevel,
            deviceType: deviceType
        )
    }
}

enum BluetoothAudioDeviceType {
    case airpods
    case airpodsGen3
    case airpodsGen4
    case airpodsPro
    case airpodsPro3
    case airpodsMax
    case beats
    case beatsstudio
    case beatssolo
    case headphones
    case speaker
    case generic
    
    var sfSymbol: String {
        switch self {
        case .airpods:
            return "airpods"
        case .airpodsGen3:
            return "airpods.gen3"
        case .airpodsGen4:
            return "airpods.gen4"
        case .airpodsPro:
            return "airpods.pro"
        case .airpodsPro3:
            return "airpods.pro"
        case .airpodsMax:
            return "airpodsmax"
        case .beats:
            return "beats.headphones"
        case .beatsstudio:
            return "beats.headphones"
        case .beatssolo:
            return "beats.headphones"
        case .headphones:
            return "headphones"
        case .speaker:
            return "hifispeaker.fill"
        case .generic:
            return "bluetooth.circle.fill"
        }
    }
    
    var displayName: String {
        switch self {
        case .airpods: return "AirPods"
        case .airpodsGen3: return "AirPods (Gen 3)"
        case .airpodsGen4: return "AirPods (Gen 4)"
        case .airpodsPro: return "AirPods Pro"
        case .airpodsPro3: return "AirPods Pro 3"
        case .airpodsMax: return "AirPods Max"
        case .beats: return "Beats"
        case .beatsstudio: return "Beats Studio"
        case .beatssolo: return "Beats Solo"
        case .headphones: return "Headphones"
        case .speaker: return "Speaker"
        case .generic: return "Bluetooth Device"
        }
    }

    /// Inline HUD only: base filename (no extension) for a looping .mov animation.
    var inlineHUDAnimationBaseName: String {
        String(describing: self)
    }
}

extension BluetoothAudioDeviceType {
    var isAirPods: Bool {
        switch self {
        case .airpods, .airpodsGen3, .airpodsGen4, .airpodsPro, .airpodsPro3, .airpodsMax:
            return true
        default:
            return false
        }
    }
}

// MARK: - Notification Name Constants

private let IOBluetoothDeviceConnectionNotification = "IOBluetoothDeviceConnectionNotification"
private let IOBluetoothDeviceDisconnectionNotification = "IOBluetoothDeviceDisconnectionNotification"
