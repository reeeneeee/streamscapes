// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "StreamscapesAgent",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "StreamscapesAgent"
        ),
    ]
)
