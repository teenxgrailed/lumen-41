// swift-tools-version: 5.9
import PackageDescription

// The widgets, Controls and Live Activity views, shared by the iOS app's
// WidgetKit extension (apps/ios) and the Mac app's (apps/macos). The data
// layer is NeedtKit; this package is only SwiftUI + WidgetKit on top of it.
let package = Package(
    name: "NeedtWidgetKit",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "NeedtWidgetKit", targets: ["NeedtWidgetKit"])
    ],
    dependencies: [
        .package(path: "../NeedtKit")
    ],
    targets: [
        .target(
            name: "NeedtWidgetKit",
            dependencies: [.product(name: "NeedtKit", package: "NeedtKit")],
            resources: [.process("Resources")]
        ),
        .testTarget(name: "NeedtWidgetKitTests", dependencies: ["NeedtWidgetKit"])
    ],
    swiftLanguageVersions: [.v5]
)
