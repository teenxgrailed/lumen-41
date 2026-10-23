import CoreLocation
import Foundation
import NeedtKit
import SwiftUI
#if canImport(WeatherKit)
import WeatherKit
#endif

// The Weather tile of the Tools module (lab: "Weather · Zürich 14° Cloudy ·
// H 16 L 8"). The only first-party weather source is WeatherKit, which works
// only in a build that is signed with the WeatherKit capability on its App ID.
// An unsigned build (CI) or one without the capability cannot reach it, so the
// tile says "Needs signing" instead of showing made-up numbers. [unverified]
// on a signed build: nothing here has run against the service.

struct IslandV3WeatherReading: Equatable {
    var place: String
    var temperature: Int
    var condition: String
    var high: Int
    var low: Int
}

enum IslandV3WeatherState: Equatable {
    /// Nothing asked yet. Location is never requested before the Tools page is used.
    case idle
    /// The person has not decided about location; the tile offers a button.
    case needsLocation
    case loading
    case ready(IslandV3WeatherReading)
    /// WeatherKit refused: the build is unsigned or lacks the capability.
    case needsSigning
    case unavailable(String)
}

@MainActor
final class IslandV3Weather: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = IslandV3Weather()

    @Published var state: IslandV3WeatherState = .idle

    private let manager = CLLocationManager()
    private var lastFetch: Date?
    private var fetching = false

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /// Called when the Tools page appears. Reads the location only if the
    /// person already allowed it; otherwise shows the button.
    func refresh() {
        if CIFixture.enabled { return }
        if let last = lastFetch, Date().timeIntervalSince(last) < 15 * 60, case .ready = state { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            state = .needsLocation
        case .denied, .restricted:
            state = .unavailable("Location is off for Needt")
        default:
            locate()
        }
    }

    /// The tile's button: the one place the permission prompt can come from.
    func allowLocation() {
        state = .loading
        manager.requestWhenInUseAuthorization()
    }

    private func locate() {
        guard !fetching else { return }
        if case .ready = state {} else { state = .loading }
        manager.requestLocation()
    }

    // MARK: CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .notDetermined: break
            case .denied, .restricted: self.state = .unavailable("Location is off for Needt")
            default: self.locate()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in await self.load(for: location) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.state = .unavailable("No location") }
    }

    // MARK: WeatherKit

    private func load(for location: CLLocation) async {
        guard !fetching else { return }
        fetching = true
        defer { fetching = false }
        #if canImport(WeatherKit)
        do {
            let (current, daily) = try await WeatherService.shared.weather(for: location, including: .current, .daily)
            let metric = Locale.current.measurementSystem != .us
            let unit: UnitTemperature = metric ? .celsius : .fahrenheit
            func degrees(_ m: Measurement<UnitTemperature>) -> Int { Int(m.converted(to: unit).value.rounded()) }
            let today = daily.forecast.first
            let place = await placeName(for: location)
            state = .ready(IslandV3WeatherReading(
                place: place,
                temperature: degrees(current.temperature),
                condition: current.condition.description,
                high: today.map { degrees($0.highTemperature) } ?? degrees(current.temperature),
                low: today.map { degrees($0.lowTemperature) } ?? degrees(current.temperature)
            ))
            lastFetch = Date()
        } catch {
            // No network is a different answer from "the build may not call
            // WeatherKit"; everything else is the signing case.
            state = (error as? URLError) != nil ? .unavailable("Offline") : .needsSigning
        }
        #else
        state = .needsSigning
        #endif
    }

    private func placeName(for location: CLLocation) async -> String {
        let marks = try? await CLGeocoder().reverseGeocodeLocation(location)
        return marks?.first?.locality ?? "Here"
    }
}

/// The third tile of the Tools page.
struct IslandV3WeatherTile: View {
    @ObservedObject var weather: IslandV3Weather

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            switch weather.state {
            case .ready(let r):
                Text("Weather · \(r.place)").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5)).lineLimit(1)
                Text("\(r.temperature)°").font(.system(size: 26, weight: .semibold)).monospacedDigit()
                Spacer()
                Text("\(r.condition) · H \(r.high) L \(r.low)")
                    .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).lineLimit(1)
            case .needsSigning:
                header
                Text("Needs signing").font(.system(size: 15, weight: .semibold))
                Spacer()
                Text("WeatherKit works only in a signed build.")
                    .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).lineLimit(2)
            case .needsLocation:
                header
                Text("Local weather").font(.system(size: 15, weight: .semibold))
                Spacer()
                Button("Allow location") { weather.allowLocation() }
                    .buttonStyle(IslandCapsuleButtonStyle(small: true))
            case .unavailable(let reason):
                header
                Text("Not available").font(.system(size: 15, weight: .semibold))
                Spacer()
                Text(reason).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55)).lineLimit(2)
            case .idle, .loading:
                header
                Text("…").font(.system(size: 26, weight: .semibold))
                Spacer()
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.06)))
    }

    private var header: some View {
        Text("Weather").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5))
    }
}
