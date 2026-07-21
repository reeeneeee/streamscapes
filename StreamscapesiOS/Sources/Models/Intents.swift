import Foundation

/// A named sonic character that can be applied to any stream channel.
struct SonicIntent: Identifiable {
    let id: String
    let name: String
    let mode: String // "pattern", "triggered", "continuous"
    let synthType: String
    let effects: [Effect]
    let synthOptions: ChannelConfig.SynthOptions
    let behaviorType: ChannelConfig.BehaviorType?
    let eventCooldownMs: Double?
    let patternType: String?

    init(
        id: String, name: String, mode: String,
        synthType: String,
        effects: [Effect],
        synthOptions: ChannelConfig.SynthOptions,
        behaviorType: ChannelConfig.BehaviorType? = nil,
        eventCooldownMs: Double? = nil,
        patternType: String? = nil
    ) {
        self.id = id
        self.name = name
        self.mode = mode
        self.synthType = synthType
        self.effects = effects
        self.synthOptions = synthOptions
        self.behaviorType = behaviorType
        self.eventCooldownMs = eventCooldownMs
        self.patternType = patternType
    }

    /// Apply this intent's patch to a ChannelConfig — never touches volume
    func apply(to config: inout ChannelConfig) {
        // Don't override mode for event channels — keep them triggered
        if config.behaviorType != .event {
            config.mode = mode
        }
        config.synthType = synthType
        config.effects = effects
        config.synthOptions = synthOptions
        config.intent = id
        if let bt = behaviorType { config.behaviorType = bt }
        if let cd = eventCooldownMs { config.eventCooldownMs = cd }
        if let pt = patternType { config.patternType = pt }
    }
}

// Helper to build nested synthOptions dictionaries concisely
private func env(_ a: Double, _ d: Double, _ s: Double, _ r: Double) -> JSONValue {
    .object(["attack": .number(a), "decay": .number(d), "sustain": .number(s), "release": .number(r)])
}

private func osc(_ type: String, partials: [Double]? = nil, spread: Double? = nil, count: Int? = nil) -> JSONValue {
    var dict: [String: JSONValue] = ["type": .string(type)]
    if let p = partials { dict["partials"] = .array(p.map { .number($0) }) }
    if let s = spread { dict["spread"] = .number(s) }
    if let c = count { dict["count"] = .number(Double(c)) }
    return .object(dict)
}

/// Universal intent library — matches web src/lib/intents.ts exactly
let ALL_INTENTS: [SonicIntent] = [
    // ── Pattern mode ──
    SonicIntent(
        id: "pure", name: "Pure", mode: "pattern",
        synthType: "Synth", effects: [],
        synthOptions: .init(["oscillator": osc("sine")])
    ),
    SonicIntent(
        id: "music-box", name: "Boop", mode: "pattern",
        synthType: "Synth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 900, "Q": 0.8]),
            Effect(type: "reverb", wet: 0.16, bypass: false, params: ["decay": 2.4, "preDelay": 0.01]),
        ],
        synthOptions: .init([
            "oscillator": osc("triangle"),
            "envelope": env(0.003, 0.18, 0.02, 0.12),
        ])
    ),
    SonicIntent(
        id: "kalimba", name: "Kalimba", mode: "pattern",
        synthType: "FMSynth",
        effects: [
            Effect(type: "reverb", wet: 0.3, bypass: false, params: ["decay": 2.5, "preDelay": 0.01]),
        ],
        synthOptions: .init([
            "harmonicity": .number(8),
            "modulationIndex": .number(2),
            "oscillator": osc("sine"),
            "envelope": env(0.001, 2, 0.1, 2),
            "modulation": .object(["type": .string("square")]),
            "modulationEnvelope": env(0.002, 0.2, 0, 0.2),
        ])
    ),
    SonicIntent(
        id: "steelpan", name: "Steelpan", mode: "pattern",
        synthType: "Synth",
        effects: [
            Effect(type: "reverb", wet: 0.25, bypass: false, params: ["decay": 2, "preDelay": 0.01]),
        ],
        synthOptions: .init([
            "oscillator": osc("fatcustom", partials: [0.2, 1, 0, 0.5, 0.1], spread: 40, count: 3),
            "envelope": env(0.001, 1.6, 0, 1.6),
        ])
    ),
    SonicIntent(
        id: "plucks", name: "Tick Tock", mode: "pattern",
        synthType: "PluckSynth",
        effects: [
            Effect(type: "delay", wet: 0.2, bypass: false, params: ["delayTime": 0.18, "feedback": 0.3]),
            Effect(type: "reverb", wet: 0.35, bypass: false, params: ["decay": 3.5, "preDelay": 0.02]),
        ],
        synthOptions: .init([
            "resonance": .number(0.96),
            "dampening": .number(6000),
            "release": .number(1.4),
        ])
    ),
    SonicIntent(
        id: "choir", name: "Choir", mode: "pattern",
        synthType: "Synth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 1800, "Q": 0.3]),
            Effect(type: "reverb", wet: 0.75, bypass: false, params: ["decay": 8, "preDelay": 0.06]),
            Effect(type: "chorus", wet: 0.3, bypass: false, params: ["frequency": 0.3, "depth": 0.4, "delayTime": 6]),
        ],
        synthOptions: .init([
            "oscillator": osc("fatsine4", spread: 20, count: 4),
            "envelope": env(1.2, 1.5, 0.6, 3.0),
        ])
    ),
    SonicIntent(
        id: "warm-pad", name: "VHS", mode: "pattern",
        synthType: "Synth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 500, "Q": 0.4]),
            Effect(type: "reverb", wet: 0.5, bypass: false, params: ["decay": 7, "preDelay": 0.05]),
        ],
        synthOptions: .init([
            "oscillator": osc("fatsawtooth", spread: 30, count: 3),
            "envelope": env(2.0, 1.5, 0.8, 4.0),
        ])
    ),
    SonicIntent(
        id: "rain", name: "Doppler", mode: "pattern",
        synthType: "Synth",
        effects: [
            Effect(type: "delay", wet: 0.45, bypass: false, params: ["delayTime": 0.08, "feedback": 0.4]),
            Effect(type: "reverb", wet: 0.35, bypass: false, params: ["decay": 3, "preDelay": 0.01]),
        ],
        synthOptions: .init([
            "oscillator": osc("sine"),
            "envelope": env(0.001, 0.06, 0, 0.04),
        ])
    ),

    // ── Triggered mode ──
    SonicIntent(
        id: "chimes", name: "Woodblock", mode: "triggered",
        synthType: "Synth",
        effects: [
            Effect(type: "reverb", wet: 0.4, bypass: false, params: ["decay": 3, "preDelay": 0.01]),
        ],
        synthOptions: .init([
            "oscillator": osc("sine"),
            "envelope": env(0.004, 0.14, 0.03, 0.1),
        ])
    ),
    SonicIntent(
        id: "marimba", name: "Reception", mode: "triggered",
        synthType: "Synth",
        effects: [
            Effect(type: "reverb", wet: 0.2, bypass: false, params: ["decay": 1.5, "preDelay": 0.01]),
        ],
        synthOptions: .init([
            "oscillator": .object(["partials": .array([.number(1), .number(0), .number(2), .number(0), .number(3)])]),
            "envelope": env(0.001, 1.2, 0, 1.2),
        ])
    ),
    SonicIntent(
        id: "bubbles", name: "Ping", mode: "triggered",
        synthType: "FMSynth",
        effects: [
            Effect(type: "reverb", wet: 0.35, bypass: false, params: ["decay": 2.5, "preDelay": 0.01]),
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 2000, "Q": 2.5]),
        ],
        synthOptions: .init([
            "oscillator": osc("sine"),
            "envelope": env(0.002, 0.2, 0, 0.15),
            "modulationIndex": .number(18),
        ])
    ),
    SonicIntent(
        id: "typewriter", name: "Chirp", mode: "triggered",
        synthType: "MembraneSynth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 3000, "Q": 1.5]),
        ],
        synthOptions: .init(),
        behaviorType: .event, eventCooldownMs: 80
    ),
    SonicIntent(
        id: "whispers", name: "Echoes", mode: "triggered",
        synthType: "AMSynth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 1200, "Q": 0.4]),
            Effect(type: "reverb", wet: 0.7, bypass: false, params: ["decay": 5, "preDelay": 0.04]),
        ],
        synthOptions: .init([
            "oscillator": osc("sine"),
            "envelope": env(0.15, 0.4, 0.1, 0.8),
        ])
    ),

    // ── Continuous mode ──
    SonicIntent(
        id: "drone", name: "Drone", mode: "continuous",
        synthType: "FMSynth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 1400, "Q": 0.7]),
            Effect(type: "reverb", wet: 0.45, bypass: false, params: ["decay": 4.2, "preDelay": 0.02]),
        ],
        synthOptions: .init([
            "oscillator": osc("sine"),
            "envelope": env(1.5, 0.8, 0.9, 3.0),
        ])
    ),
    SonicIntent(
        id: "static", name: "Static", mode: "continuous",
        synthType: "Synth",
        effects: [
            Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 600, "Q": 0.8]),
            Effect(type: "reverb", wet: 0.3, bypass: false, params: ["decay": 3, "preDelay": 0.02]),
        ],
        synthOptions: .init([
            "oscillator": osc("sine"),
            "envelope": env(1.5, 0.5, 0.9, 3.0),
        ])
    ),
]

/// Arp shapes — matches web ARP_SHAPES in audio-engine.ts
struct ArpShape: Identifiable {
    let id: String
    let label: String
    let degrees: [Int]
}

let ARP_SHAPES: [ArpShape] = [
    ArpShape(id: "up",       label: "Up",        degrees: [0, 1, 2, 3, 4]),
    ArpShape(id: "down",     label: "Down",      degrees: [4, 3, 2, 1, 0]),
    ArpShape(id: "upDown",   label: "Up-Down",   degrees: [0, 1, 2, 3, 4, 3, 2, 1]),
    ArpShape(id: "walk",     label: "Walk",      degrees: [0, 1, 2, 4, 2, 1]),
    ArpShape(id: "skip",     label: "Skip",      degrees: [0, 2, 4, 2, 4, 2]),
    ArpShape(id: "fadada",   label: "FADADA",    degrees: [4, 0, 3, 0, 3, 0]),
    ArpShape(id: "pedal",    label: "Pedal",     degrees: [0, 2, 0, 4, 0, 2]),
    ArpShape(id: "pendulum", label: "Pendulum",  degrees: [0, 4, 1, 3, 2]),
    ArpShape(id: "leap",     label: "Leap",      degrees: [0, 4, 1, 3, 2, 4]),
    ArpShape(id: "stutter",  label: "Stutter",   degrees: [0, 0, 2, 0, 4, 4]),
]

/// Get intents filtered by mode
func intentsForMode(_ mode: String) -> [SonicIntent] {
    ALL_INTENTS.filter { $0.mode == mode }
}
