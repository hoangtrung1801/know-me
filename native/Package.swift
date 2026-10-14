// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KnowMe",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "KnowMeCore", targets: ["KnowMeCore"]),
        .executable(name: "KnowMeApp", targets: ["KnowMeApp"])
    ],
    targets: [
        .target(name: "KnowMeCore"),
        .executableTarget(name: "KnowMeApp", dependencies: ["KnowMeCore"]),
        .testTarget(name: "KnowMeCoreTests", dependencies: ["KnowMeCore"]),
        .testTarget(name: "KnowMeAppTests", dependencies: ["KnowMeApp"])
    ]
)
