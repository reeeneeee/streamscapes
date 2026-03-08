import Foundation

struct BuiltinPreset: Sendable {
    let id: String
    let name: String
    let description: String
    let signalPlan: String
    let tags: [String]
    let cpuCost: String
    let channels: [String: ChannelConfig]
    let global: GlobalConfig
}

enum PresetCatalog {
    static func all(defaultChannels: [String: ChannelConfig]) -> [BuiltinPreset] {
        [
            ghostlyChoir(defaultChannels: defaultChannels),
            plinkyWood(defaultChannels: defaultChannels),
            musicBoxTonal(defaultChannels: defaultChannels),
            distantDrone(defaultChannels: defaultChannels),
            rainyNeon(defaultChannels: defaultChannels),
            eightBitScatter(defaultChannels: defaultChannels),
        ]
    }

    private static func clone(_ channels: [String: ChannelConfig]) -> [String: ChannelConfig] { channels }

    private static func setStream(
        _ channels: inout [String: ChannelConfig],
        id: String,
        enabled: Bool,
        mute: Bool? = nil
    ) {
        guard channels[id] != nil else { return }
        channels[id]?.enabled = enabled
        channels[id]?.mute = mute ?? !enabled
        channels[id]?.solo = false
    }

    private static func ghostlyChoir(defaultChannels: [String: ChannelConfig]) -> BuiltinPreset {
        var ch = clone(defaultChannels)
        setStream(&ch, id: "weather", enabled: true, mute: false)
        setStream(&ch, id: "flights", enabled: false)
        setStream(&ch, id: "wikipedia", enabled: false)
        setStream(&ch, id: "rss", enabled: false)
        setStream(&ch, id: "stocks", enabled: false)
        ch["weather"]?.behaviorType = .ambient
        ch["weather"]?.ambientMode = .arpeggio
        ch["weather"]?.mode = "pattern"
        ch["weather"]?.synthType = "AMSynth"
        ch["weather"]?.volume = -8
        ch["weather"]?.synthOptions.oscillatorType = "sine"
        ch["weather"]?.synthOptions.envelope = .init(attack: 0.6, decay: 1.2, sustain: 0.75, release: 2.5)
        ch["weather"]?.effects = [
            .init(type: "reverb", wet: 0.65, bypass: false, params: ["decay": 6, "preDelay": 0.03]),
            .init(type: "chorus", wet: 0.35, bypass: false, params: ["frequency": 0.8, "depth": 0.5, "delayTime": 3.2]),
        ]
        return .init(
            id: "ghostly-choir",
            name: "Ghostly Choir",
            description: "Slow, airy weather harmonies with deep reverb and chorus.",
            signalPlan: "weather (ambient)",
            tags: ["ambient", "cinematic", "long-listen"],
            cpuCost: "medium",
            channels: ch,
            global: .init(rootNote: "D4", scale: "minor pentatonic", tempo: 62, masterVolume: -2)
        )
    }

    private static func plinkyWood(defaultChannels: [String: ChannelConfig]) -> BuiltinPreset {
        var ch = clone(defaultChannels)
        setStream(&ch, id: "weather", enabled: true, mute: false)
        setStream(&ch, id: "wikipedia", enabled: true, mute: false)
        setStream(&ch, id: "flights", enabled: false)
        setStream(&ch, id: "rss", enabled: false)
        setStream(&ch, id: "stocks", enabled: false)
        ch["weather"]?.behaviorType = .ambient
        ch["weather"]?.ambientMode = .arpeggio
        ch["weather"]?.mode = "pattern"
        ch["weather"]?.synthType = "PluckSynth"
        ch["weather"]?.volume = -10
        ch["weather"]?.effects = [
            .init(type: "delay", wet: 0.18, bypass: false, params: ["delayTime": 0.18, "feedback": 0.25]),
        ]
        ch["weather"]?.synthOptions = .init()
        ch["wikipedia"]?.synthType = "Synth"
        ch["wikipedia"]?.volume = -15
        ch["wikipedia"]?.effects = []
        ch["wikipedia"]?.synthOptions.oscillatorType = "triangle"
        ch["wikipedia"]?.synthOptions.envelope = .init(attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.08)
        return .init(
            id: "plinky-wood",
            name: "Plinky (Wood)",
            description: "Col legno / woodpluck texture with tiny chime accents.",
            signalPlan: "weather (ambient), wikipedia (event)",
            tags: ["percussive", "light", "mixed"],
            cpuCost: "low",
            channels: ch,
            global: .init(rootNote: "C5", scale: "major pentatonic", tempo: 120, masterVolume: -4)
        )
    }

    private static func musicBoxTonal(defaultChannels: [String: ChannelConfig]) -> BuiltinPreset {
        var ch = clone(defaultChannels)
        setStream(&ch, id: "weather", enabled: true, mute: false)
        setStream(&ch, id: "wikipedia", enabled: true, mute: false)
        setStream(&ch, id: "flights", enabled: false)
        setStream(&ch, id: "rss", enabled: false)
        setStream(&ch, id: "stocks", enabled: false)
        ch["weather"]?.synthType = "Synth"
        ch["weather"]?.mode = "pattern"
        ch["weather"]?.volume = -9
        ch["weather"]?.synthOptions.oscillatorType = "triangle"
        ch["weather"]?.synthOptions.envelope = .init(attack: 0.003, decay: 0.18, sustain: 0.02, release: 0.12)
        ch["weather"]?.effects = [
            .init(type: "filter", wet: 1, bypass: false, params: ["frequency": 900, "Q": 0.8]),
            .init(type: "reverb", wet: 0.16, bypass: false, params: ["decay": 2.4, "preDelay": 0.01]),
            .init(type: "delay", wet: 0.12, bypass: false, params: ["delayTime": 0.14, "feedback": 0.18]),
        ]
        ch["wikipedia"]?.synthType = "Synth"
        ch["wikipedia"]?.volume = -17
        ch["wikipedia"]?.effects = []
        ch["wikipedia"]?.synthOptions.oscillatorType = "sine"
        ch["wikipedia"]?.synthOptions.envelope = .init(attack: 0.004, decay: 0.14, sustain: 0.03, release: 0.1)
        return .init(
            id: "music-box-tonal",
            name: "Music Box (Tonal)",
            description: "Bell-like tuned plinks with cleaner pitch center.",
            signalPlan: "weather (ambient), wikipedia (event)",
            tags: ["tonal", "delicate", "mixed"],
            cpuCost: "medium",
            channels: ch,
            global: .init(rootNote: "C5", scale: "major pentatonic", tempo: 116, masterVolume: -4)
        )
    }

    private static func distantDrone(defaultChannels: [String: ChannelConfig]) -> BuiltinPreset {
        var ch = clone(defaultChannels)
        setStream(&ch, id: "flights", enabled: true, mute: false)
        setStream(&ch, id: "weather", enabled: true, mute: false)
        setStream(&ch, id: "wikipedia", enabled: false)
        setStream(&ch, id: "rss", enabled: false)
        setStream(&ch, id: "stocks", enabled: false)
        ch["flights"]?.behaviorType = .ambient
        ch["flights"]?.ambientMode = .sustain
        ch["flights"]?.mode = "continuous"
        ch["flights"]?.synthType = "FMSynth"
        ch["flights"]?.volume = -12
        ch["flights"]?.synthOptions.oscillatorType = "sine"
        ch["flights"]?.synthOptions.envelope = .init(attack: 1.5, decay: 0.8, sustain: 0.9, release: 3.0)
        ch["flights"]?.effects = [
            .init(type: "filter", wet: 1, bypass: false, params: ["frequency": 1400, "Q": 0.7]),
            .init(type: "reverb", wet: 0.45, bypass: false, params: ["decay": 4.2, "preDelay": 0.02]),
        ]
        ch["weather"]?.behaviorType = .ambient
        ch["weather"]?.ambientMode = .sustain
        ch["weather"]?.mode = "continuous"
        ch["weather"]?.synthType = "AMSynth"
        ch["weather"]?.volume = -13
        ch["weather"]?.smoothingMs = 1600
        ch["weather"]?.synthOptions.oscillatorType = "sine"
        ch["weather"]?.synthOptions.envelope = .init(attack: 1.2, decay: 0.7, sustain: 0.85, release: 2.8)
        ch["weather"]?.effects = [
            .init(type: "reverb", wet: 0.35, bypass: false, params: ["decay": 5.2, "preDelay": 0.03]),
        ]
        return .init(
            id: "distant-drone",
            name: "Distant Drone",
            description: "Low evolving drones with a guaranteed ambient sustain bed.",
            signalPlan: "flights (ambient), weather (ambient)",
            tags: ["drone", "ambient", "long-listen"],
            cpuCost: "medium",
            channels: ch,
            global: .init(rootNote: "A3", scale: "minor", tempo: 60, masterVolume: -4)
        )
    }

    private static func rainyNeon(defaultChannels: [String: ChannelConfig]) -> BuiltinPreset {
        var ch = clone(defaultChannels)
        setStream(&ch, id: "weather", enabled: true, mute: false)
        setStream(&ch, id: "rss", enabled: true, mute: false)
        setStream(&ch, id: "flights", enabled: false)
        setStream(&ch, id: "wikipedia", enabled: false)
        setStream(&ch, id: "stocks", enabled: false)
        ch["weather"]?.synthType = "Synth"
        ch["weather"]?.volume = -8
        ch["weather"]?.synthOptions.oscillatorType = "triangle"
        ch["weather"]?.synthOptions.envelope = .init(attack: 0.15, decay: 0.35, sustain: 0.5, release: 0.7)
        ch["weather"]?.effects = [
            .init(type: "delay", wet: 0.3, bypass: false, params: ["delayTime": 0.25, "feedback": 0.4]),
            .init(type: "chorus", wet: 0.2, bypass: false, params: ["frequency": 1.2, "depth": 0.6, "delayTime": 3.5]),
        ]
        ch["rss"]?.synthType = "PluckSynth"
        ch["rss"]?.volume = -20
        ch["rss"]?.effects = []
        ch["rss"]?.synthOptions = .init()
        return .init(
            id: "rainy-neon",
            name: "Rainy Neon",
            description: "Wet weather pulse with soft plucks in a moody dorian palette.",
            signalPlan: "weather (ambient), rss (event)",
            tags: ["moody", "rhythmic", "mixed"],
            cpuCost: "medium",
            channels: ch,
            global: .init(rootNote: "E4", scale: "dorian", tempo: 92, masterVolume: -5)
        )
    }

    private static func eightBitScatter(defaultChannels: [String: ChannelConfig]) -> BuiltinPreset {
        var ch = clone(defaultChannels)
        setStream(&ch, id: "stocks", enabled: true, mute: false)
        setStream(&ch, id: "weather", enabled: true, mute: false)
        setStream(&ch, id: "flights", enabled: false)
        setStream(&ch, id: "wikipedia", enabled: false)
        setStream(&ch, id: "rss", enabled: false)
        ch["stocks"]?.synthType = "MembraneSynth"
        ch["stocks"]?.behaviorType = .event
        ch["stocks"]?.eventCooldownMs = 120
        ch["stocks"]?.volume = -5
        ch["stocks"]?.effects = [
            .init(type: "compressor", wet: 1, bypass: false, params: ["threshold": -24, "ratio": 6]),
            .init(type: "distortion", wet: 0.2, bypass: false, params: ["distortion": 0.28]),
        ]
        ch["stocks"]?.synthOptions = .init()
        ch["weather"]?.synthType = "AMSynth"
        ch["weather"]?.mode = "pattern"
        ch["weather"]?.behaviorType = .ambient
        ch["weather"]?.ambientMode = .arpeggio
        ch["weather"]?.smoothingMs = 900
        ch["weather"]?.volume = -9
        ch["weather"]?.effects = [
            .init(type: "delay", wet: 0.22, bypass: false, params: ["delayTime": 0.125, "feedback": 0.28]),
            .init(type: "filter", wet: 1, bypass: false, params: ["frequency": 1800, "Q": 1.2]),
        ]
        ch["weather"]?.synthOptions.oscillatorType = "sawtooth"
        ch["weather"]?.synthOptions.envelope = .init(attack: 0.01, decay: 0.18, sustain: 0.2, release: 0.18)
        return .init(
            id: "tense-pulse",
            name: "8-Bit Scatter",
            description: "Chippy, irregular digital blips over a tense synthetic bed.",
            signalPlan: "weather (ambient), stocks (event)",
            tags: ["alert", "noisy", "event-heavy"],
            cpuCost: "high",
            channels: ch,
            global: .init(rootNote: "F3", scale: "phrygian", tempo: 132, masterVolume: -3)
        )
    }
}
