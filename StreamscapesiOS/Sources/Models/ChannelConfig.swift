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
    var eventCooldownMs: Double? = nil
    var eventTriggerThreshold: Double? = nil
    var eventBurstCap: Int? = nil
    var eventBurstWindowMs: Double? = nil
    var eventArticulation: Articulation? = nil
    var smoothingMs: Double? = nil
    var preMapWindow: Int? = nil
    var preMapStatistic: PreMapStatistic? = nil
    var preMapChangeThreshold: Double? = nil
    var preMapDerivative: Bool? = nil
    var preMapPercentileClamp: Double? = nil
    var alertTier: AlertTier? = nil
    var beaconThreshold: Double? = nil
    var beaconPeriodicSec: Double? = nil
    var beaconOnExtrema: Bool? = nil
    var hybridAccent: Double? = nil
    var sampleSource: String? = nil
    var samplePlaybackRateMin: Double? = nil
    var samplePlaybackRateMax: Double? = nil
    var sampleDensity: Double? = nil
    var sampleFilterCutoff: Double? = nil
    var sampleReverbSend: Double? = nil
    var entityField: String? = nil
    var patternType: String? = nil

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

    enum PreMapStatistic: String, Codable, Sendable {
        case mean, median
    }

    enum AlertTier: String, Codable, Sendable {
        case advisory, abnormal, critical
    }
}

struct SonificationMapping: Codable, Sendable {
    var sourceField: String
    var targetParam: String
    var inputRange: [Double]
    var outputRange: [Double]
    var curve: CurveType
    var invert: Bool
    var smoothingMs: Double? = nil
    var quantizeStep: Double? = nil
    var hysteresis: Double? = nil

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
