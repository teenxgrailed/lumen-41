// swift-tools-version: 5.9
import PackageDescription

// Shared by the native Mac app (apps/macos) and, later, the iOS app's widgets
// and App Intents (apps/ios). Foundation only, so it builds on every Apple
// platform and in a plain `swift test`.
let package = Package(
    name: "NeedtKit",
    platforms: [.macOS(.v14), .iOS(.v15)],
    products: [
        .library(name: "NeedtKit", targets: ["NeedtKit"])
    ],
    targets: [
        .target(name: "NeedtKit"),
        .testTarget(name: "NeedtKitTests", dependencies: ["NeedtKit"])
    ],
    swiftLanguageVersions: [.v5]
)
