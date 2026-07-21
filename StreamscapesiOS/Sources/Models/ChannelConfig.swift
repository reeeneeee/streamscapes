import Foundation

/// Type-safe wrapper for arbitrary JSON values (nested objects, arrays, primitives).
enum JSONValue: Codable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(Bool.self) { self = .bool(v) }
        else if let v = try? container.decode(Double.self) { self = .number(v) }
        else if let v = try? container.decode(String.self) { self = .string(v) }
        else if let v = try? container.decode([String: JSONValue].self) { self = .object(v) }
        else if let v = try? container.decode([JSONValue].self) { self = .array(v) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .number(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        case .object(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }

    func toAny() -> Any {
        switch self {
        case .string(let v): return v
        case .number(let v): return v
        case .bool(let v): return v
        case .object(let v): return v.mapValues { $0.toAny() }
        case .array(let v): return v.map { $0.toAny() }
        case .null: return NSNull()
        }
    }
}

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
    var noiseType: String? = nil   // "white", "pink", "brown", "green"
    var intent: String? = nil
    var parentPluginId: String? = nil
    var soundEnabled: Bool? = nil // nil = enabled (default true)
    var visualEnabled: Bool? = nil // nil = enabled (default true)

    /// Passthrough dictionary — forwarded as-is to the JS AudioEngine.
    /// Supports nested objects like `oscillator: { type: "fatsine4", spread: 60 }`,
    /// FM params (`harmonicity`, `modulationIndex`, `modulation`, `modulationEnvelope`), etc.
    struct SynthOptions: Codable, Sendable, ExpressibleByDictionaryLiteral {
        var storage: [String: JSONValue]

        init(dictionaryLiteral elements: (String, JSONValue)...) {
            storage = Dictionary(uniqueKeysWithValues: elements)
        }

        init(_ dict: [String: JSONValue] = [:]) {
            storage = dict
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            storage = try container.decode([String: JSONValue].self)
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            try container.encode(storage)
        }

        /// Convert to plain [String: Any] for JSON serialization in the bridge
        func toDict() -> [String: Any] {
            storage.mapValues { $0.toAny() }
        }

        // MARK: - Convenience accessors for backward compatibility

        /// Set oscillator type (e.g. "sine", "triangle", "sawtooth")
        var oscillatorType: String? {
            get {
                if case .object(let osc) = storage["oscillator"],
                   case .string(let t) = osc["type"] { return t }
                return nil
            }
            set {
                if let v = newValue {
                    if case .object(var osc) = storage["oscillator"] {
                        osc["type"] = .string(v)
                        storage["oscillator"] = .object(osc)
                    } else {
                        storage["oscillator"] = .object(["type": .string(v)])
                    }
                } else {
                    storage.removeValue(forKey: "oscillator")
                }
            }
        }

        /// Set ADSR envelope
        var envelope: Envelope? {
            get {
                guard case .object(let env) = storage["envelope"],
                      case .number(let a) = env["attack"],
                      case .number(let d) = env["decay"],
                      case .number(let s) = env["sustain"],
                      case .number(let r) = env["release"]
                else { return nil }
                return Envelope(attack: a, decay: d, sustain: s, release: r)
            }
            set {
                if let v = newValue {
                    storage["envelope"] = .object([
                        "attack": .number(v.attack),
                        "decay": .number(v.decay),
                        "sustain": .number(v.sustain),
                        "release": .number(v.release),
                    ])
                } else {
                    storage.removeValue(forKey: "envelope")
                }
            }
        }

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
