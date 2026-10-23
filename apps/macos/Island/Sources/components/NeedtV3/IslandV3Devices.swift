import AppKit
import AudioToolbox
import CoreAudio
import Foundation
import IOKit.ps
#if !APPSTORE
import IOBluetooth
#endif

// Small, public-API readers the island v3 needs: the Mac's battery, the output
// volume, and (direct build only) Bluetooth audio connections.

/// The Mac's own battery through IOKit power sources.
enum IslandV3Power {
    struct Reading: Equatable {
        var percent: Int
        var isCharging: Bool
        var isPluggedIn: Bool
    }

    static func read() -> Reading? {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef]
        else { return nil }
        for source in list {
            guard let description = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  // The Mac's own battery, not a Bluetooth accessory that the
                  // system lists next to it.
                  (description[kIOPSTypeKey] as? String) == kIOPSInternalBatteryType,
                  let current = description[kIOPSCurrentCapacityKey] as? Int,
                  let maximum = description[kIOPSMaxCapacityKey] as? Int, maximum > 0
            else { continue }
            let state = description[kIOPSPowerSourceStateKey] as? String
            let charging = (description[kIOPSIsChargingKey] as? Bool) ?? false
            return Reading(
                percent: Int((Double(current) / Double(maximum) * 100).rounded()),
                isCharging: charging,
                isPluggedIn: state == kIOPSACPowerValue
            )
        }
        return nil
    }
}

extension IslandV3Power {
    /// The level of a connected accessory (AirPods, Magic devices) when the
    /// system lists it as a power source under the same name. This is the only
    /// public route to it (IOBluetooth has no battery property); when the
    /// system does not list the device it returns nil and the island shows the
    /// connection without a percentage. [unverified] whether macOS lists
    /// AirPods this way on every OS version.
    static func accessoryPercent(named name: String) -> Int? {
        let wanted = name.trimmingCharacters(in: .whitespaces).lowercased()
        guard !wanted.isEmpty,
              let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef]
        else { return nil }
        for source in list {
            guard let description = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  (description[kIOPSTypeKey] as? String) != kIOPSInternalBatteryType,
                  let rawName = (description[kIOPSNameKey] as? String)?.lowercased(), !rawName.isEmpty,
                  rawName == wanted || rawName.contains(wanted) || wanted.contains(rawName),
                  let current = description[kIOPSCurrentCapacityKey] as? Int
            else { continue }
            let maximum = (description[kIOPSMaxCapacityKey] as? Int) ?? 100
            guard maximum > 0 else { continue }
            return min(100, max(0, Int((Double(current) / Double(maximum) * 100).rounded())))
        }
        return nil
    }
}

/// The default output device's volume through CoreAudio (public API).
final class IslandV3Audio {
    static let shared = IslandV3Audio()
    private init() {}

    private var deviceID: AudioDeviceID {
        var id = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id)
        return id
    }

    private func volumeAddress() -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(
            mSelector: kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    /// 0...1, nil when the device has no volume control (some HDMI outputs).
    var volume: Double? {
        var address = volumeAddress()
        var value = Float32(0)
        var size = UInt32(MemoryLayout<Float32>.size)
        let id = deviceID
        guard id != 0, AudioObjectHasProperty(id, &address) else { return nil }
        let status = AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value)
        return status == noErr ? Double(value) : nil
    }

    @discardableResult
    func set(_ newValue: Double) -> Double {
        var address = volumeAddress()
        var value = Float32(max(0, min(1, newValue)))
        let id = deviceID
        guard id != 0, AudioObjectHasProperty(id, &address) else { return newValue }
        AudioObjectSetPropertyData(id, &address, 0, nil, UInt32(MemoryLayout<Float32>.size), &value)
        return Double(value)
    }

    /// Moves the volume by `delta` (1.0 = the whole range) and returns it.
    func adjust(by delta: Double) -> Double {
        set((volume ?? 0.5) + delta)
    }

    /// The name of the current output, for the Devices module.
    var outputName: String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var name: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        let id = deviceID
        guard id != 0 else { return nil }
        let status = AudioObjectGetPropertyData(id, &address, 0, nil, &size, &name)
        guard status == noErr, let name else { return nil }
        return name.takeRetainedValue() as String
    }

    /// Calls `handler` on the main queue when the output volume changes.
    func observe(_ handler: @escaping (Double) -> Void) -> AnyObject? {
        var address = volumeAddress()
        let id = deviceID
        guard id != 0, AudioObjectHasProperty(id, &address) else { return nil }
        let token = ListenerToken()
        let block: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            guard let self, let value = self.volume else { return }
            handler(value)
        }
        token.block = block
        token.device = id
        token.address = address
        AudioObjectAddPropertyListenerBlock(id, &address, DispatchQueue.main, block)
        return token
    }

    final class ListenerToken {
        var block: AudioObjectPropertyListenerBlock?
        var device: AudioObjectID = 0
        var address = AudioObjectPropertyAddress()
        deinit {
            if let block, device != 0 {
                AudioObjectRemovePropertyListenerBlock(device, &address, DispatchQueue.main, block)
            }
        }
    }
}

#if !APPSTORE
/// Tells the island when a Bluetooth audio device (AirPods and the like)
/// connects. The battery level of AirPods is not public, so only the name is
/// reported.
final class IslandV3BluetoothWatcher: NSObject {
    private var registration: IOBluetoothUserNotification?
    private let onConnect: (String) -> Void

    init(onConnect: @escaping (String) -> Void) {
        self.onConnect = onConnect
        super.init()
        registration = IOBluetoothDevice.register(
            forConnectNotifications: self,
            selector: #selector(deviceConnected(_:device:))
        )
    }

    deinit { registration?.unregister() }

    @objc private func deviceConnected(_ notification: IOBluetoothUserNotification, device: IOBluetoothDevice) {
        // Audio devices only: major class 0x04 (audio/video).
        guard device.deviceClassMajor == 0x04, let name = device.name else { return }
        DispatchQueue.main.async { [onConnect] in onConnect(name) }
    }
}
#endif
