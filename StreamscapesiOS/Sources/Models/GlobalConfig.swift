import Foundation

struct GlobalConfig: Codable, Sendable {
    var rootNote: String
    var scale: String
    var tempo: Int
    var masterVolume: Double

    static let `default` = GlobalConfig(
        rootNote: "C4",
        scale: "major pentatonic",
        tempo: 120,
        masterVolume: 0
    )
}
