import Foundation

struct ChannelConfig: Codable, Sendable {
    var streamId: String
    var enabled: Bool
    var mode: String
    var synthType: String
    var volume: Double
    var pan: Double
    var mute: Bool
    var solo: Bool
    var synthOptions: SynthOptions
    var mappings: [SonificationMapping]
    var effects: [Effect]

    // Behavior
    var behaviorType: BehaviorType
    var ambientMode: AmbientMode

    // Event settings
    var eventCooldownMs: Double?
    var eventArticulation: Articulation?

    struct SynthOptions: Codable, Sendable {
        var oscillatorType: String?
        var envelope: Envelope?

        struct Envelope: Codable, Sendable {
            var attack: Double
            var decay: Double
            var sustain: Double
            var release: Double
        }
    }

    enum BehaviorType: String, Codable, Sendable {
        case ambient, event, hybrid
    }

    enum AmbientMode: String, Codable, Sendable {
        case arpeggio, sustain, sample, loop, drone
    }

    enum Articulation: String, Codable, Sendable {
        case soft, neutral, punchy
    }
}

struct SonificationMapping: Codable, Sendable {
    var sourceField: String
    var targetParam: String
    var inputRange: [Double]
    var outputRange: [Double]
    var curve: CurveType
    var invert: Bool
    var smoothingMs: Double?

    enum CurveType: String, Codable, Sendable {
        case linear, log, exp, step
    }
}

struct Effect: Codable, Sendable {
    var type: String
    var wet: Double
    var bypass: Bool
    var params: [String: Double]
}
