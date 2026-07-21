import SwiftUI
import Observation

@Observable
final class AppStore {
    // MARK: - State
    var isPlaying = false
    var global = GlobalConfig.default
    var channels: [String: ChannelConfig] = AppStore.makeDefaultChannels()
    var activeStreams: [String: StreamState] = [:]
    var selectedChannelId: String? = "weather:temp"
    var lockGlobalFrame: Bool = true
    var weatherDisplay: WeatherDisplayData?
    var stockSymbols: [String] = ["AAPL", "GOOGL", "TSLA"]
    var rssFeeds: [String] = ["https://feeds.arstechnica.com/arstechnica/index"]

    struct WeatherDisplayData {
        var feelsLike: Double
        var clouds: Double
    }

    /// Called after every mutation that should trigger engine reconciliation.
    var onReconcileNeeded: (() -> Void)?

    // MARK: - Persistence
    private static let persistKey = "com.streamscapes.appStore"

    init() {
        loadFromDisk()
    }

    private func persistToDisk() {
        let snapshot = PersistedState(global: global, channels: channels, selectedChannelId: selectedChannelId, stockSymbols: stockSymbols, rssFeeds: rssFeeds)
        if let data = try? JSONEncoder().encode(snapshot) {
            UserDefaults.standard.set(data, forKey: Self.persistKey)
        }
    }

    private func loadFromDisk() {
        guard let data = UserDefaults.standard.data(forKey: Self.persistKey),
              let snapshot = try? JSONDecoder().decode(PersistedState.self, from: data)
        else { return }
        global = snapshot.global
        channels = snapshot.channels
        selectedChannelId = snapshot.selectedChannelId
        if let s = snapshot.stockSymbols { stockSymbols = s }
        if let r = snapshot.rssFeeds { rssFeeds = r }

        // Backfill any missing default channels (e.g. archive added after initial install)
        let defaults = Self.makeDefaultChannels()
        for (id, config) in defaults where channels[id] == nil {
            channels[id] = config
        }
    }

    private struct PersistedState: Codable {
        let global: GlobalConfig
        let channels: [String: ChannelConfig]
        let selectedChannelId: String?
        var stockSymbols: [String]?
        var rssFeeds: [String]?
    }

    enum StreamState {
        case connecting
        case connected
        case error(String)
    }

    // MARK: - Derived
    /// Explicit display order matching web ALL_DEFAULT_CHANNELS
    private static let displayOrder = ["weather:temp", "weather:clouds", "flights", "wikipedia", "archive", "rss", "stocks", "otlp"]
    var channelIds: [String] {
        let known = Self.displayOrder.filter { channels.keys.contains($0) }
        let extra = channels.keys.sorted().filter { !Self.displayOrder.contains($0) }
        return known + extra
    }

    var activeCount: Int {
        channels.values.filter { $0.enabled && !$0.mute }.count
    }

    // MARK: - Actions
    func updateChannel(_ id: String, _ update: (inout ChannelConfig) -> Void) {
        guard var config = channels[id] else { return }
        update(&config)

        // Solo means only this stream is heard
        if config.solo {
            for key in channels.keys where key != id {
                channels[key]?.solo = false
                channels[key]?.enabled = false
            }
        }

        channels[id] = config
        onReconcileNeeded?()
        persistToDisk()
    }

    func updateGlobal(_ update: (inout GlobalConfig) -> Void) {
        update(&global)
        onReconcileNeeded?()
        persistToDisk()
    }

    func setPlaying(_ playing: Bool) {
        isPlaying = playing
    }

    func setStreamState(_ id: String, _ state: StreamState?) {
        activeStreams[id] = state
    }

    func addChannel(_ config: ChannelConfig) {
        guard channels[config.streamId] == nil else { return }
        channels[config.streamId] = config
        print("[Store] Added channel: \(config.streamId) — total: \(channels.count)")
        onReconcileNeeded?()
        persistToDisk()
    }

    /// Save after editing stockSymbols/rssFeeds from UI.
    func persistAfterEdit() {
        persistToDisk()
    }

    func removeChannel(_ id: String) {
        channels.removeValue(forKey: id)
        activeStreams.removeValue(forKey: id)
        if selectedChannelId == id {
            selectedChannelId = channels.keys.sorted().first
        }
        onReconcileNeeded?()
        persistToDisk()
    }

    func applyPreset(_ preset: BuiltinPreset) {
        channels = preset.channels
        if !lockGlobalFrame {
            global = preset.global
        }
        selectedChannelId = channels.first(where: { $0.value.enabled })?.key ?? channels.keys.sorted().first
        onReconcileNeeded?()
        persistToDisk()
    }

    func applyGenericSettingsAll() {
        channels = Self.makeDefaultChannels()
        selectedChannelId = "weather:temp"
        onReconcileNeeded?()
        persistToDisk()
    }

    /// Reset sound character (synths, effects, modes) but preserve all volume/mix state.
    func resetAudioConfig() {
        var fresh = Self.makeDefaultChannels()
        for (id, var ch) in fresh {
            if let cur = channels[id] {
                ch.volume = cur.volume
                ch.pan = cur.pan
                ch.mute = cur.mute
                ch.solo = cur.solo
            }
            fresh[id] = ch
        }
        let masterVol = global.masterVolume
        channels = fresh
        global = GlobalConfig.default
        global.masterVolume = masterVol
        selectedChannelId = "weather:temp"
        onReconcileNeeded?()
        persistToDisk()
    }

    // MARK: - Defaults
    static func makeDefaultChannels() -> [String: ChannelConfig] {
        var result: [String: ChannelConfig] = [:]

        // Weather parent: controls plugin connection, doesn't produce sound (muted)
        result["weather"] = ChannelConfig(
            streamId: "weather",
            enabled: true,
            mode: "pattern",
            synthType: "Synth",
            volume: -60,
            pan: 0,
            mute: true,
            solo: false,
            synthOptions: .init(["oscillator": .object(["type": .string("sine")])]),
            mappings: [],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .arpeggio,
            smoothingMs: 1200,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "rain",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.2,
            sampleDensity: 1.2,
            sampleFilterCutoff: 2200,
            sampleReverbSend: 0.25,
            entityField: nil,
            patternType: nil
        )

        // Temperature: arpeggio pattern driven by feelsLike
        result["weather:temp"] = ChannelConfig(
            streamId: "weather:temp",
            enabled: true,
            mode: "pattern",
            synthType: "Synth",
            volume: -12,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init(["oscillator": .object(["type": .string("sine")])]),
            mappings: [
                SonificationMapping(
                    sourceField: "feelsLike",
                    targetParam: "patternSelect",
                    inputRange: [-10, 110],
                    outputRange: [0, 2],
                    curve: .step,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .arpeggio,
            smoothingMs: 1200,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "rain",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.2,
            sampleDensity: 1.2,
            sampleFilterCutoff: 2200,
            sampleReverbSend: 0.25,
            entityField: nil,
            patternType: "walk",
            intent: "pure",
            parentPluginId: "weather"
        )

        // Cloud cover: continuous brown noise drone driven by cloud %
        result["weather:clouds"] = ChannelConfig(
            streamId: "weather:clouds",
            enabled: true,
            mode: "continuous",
            synthType: "Synth",
            volume: -10,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("sine")]),
            ]),
            mappings: [
                SonificationMapping(
                    sourceField: "clouds",
                    targetParam: "noiseVolume",
                    inputRange: [0, 100],
                    outputRange: [-48, -8],
                    curve: .linear,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .sustain,
            smoothingMs: 300,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "rain",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.2,
            sampleDensity: 1.2,
            sampleFilterCutoff: 2200,
            sampleReverbSend: 0.25,
            entityField: nil,
            patternType: nil,
            noiseType: "brown",
            intent: "drone",
            parentPluginId: "weather"
        )

        // Flights: continuous drone per entity, matches web default
        // Web: mode=continuous, behaviorType=ambient, ambientMode=sustain, volume=-20
        result["flights"] = ChannelConfig(
            streamId: "flights",
            enabled: true,
            mode: "continuous",
            synthType: "Synth",
            volume: -20,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("sine")]),
                "envelope": .object(["attack": .number(0.1), "decay": .number(0.2), "sustain": .number(0.5), "release": .number(0.8)]),
            ]),
            mappings: [
                SonificationMapping(
                    sourceField: "frequency",
                    targetParam: "frequency",
                    inputRange: [110, 880],
                    outputRange: [110, 880],
                    curve: .linear,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .sustain,
            eventCooldownMs: nil,
            eventTriggerThreshold: 0,
            eventBurstCap: 0,
            eventBurstWindowMs: 1200,
            eventArticulation: .neutral,
            smoothingMs: 800,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "wind",
            samplePlaybackRateMin: 0.75,
            samplePlaybackRateMax: 1.1,
            sampleDensity: 0.8,
            sampleFilterCutoff: 1800,
            sampleReverbSend: 0.35,
            entityField: "flightId",
            patternType: nil,
            intent: "drone"
        )

        // Wikipedia: triggered notes, matches web default
        // Web: mode=triggered, behaviorType=event, volume=-8
        result["wikipedia"] = ChannelConfig(
            streamId: "wikipedia",
            enabled: true,
            mode: "triggered",
            synthType: "Synth",
            volume: -8,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("sine")]),
                "envelope": .object(["attack": .number(0.01), "decay": .number(0.2), "sustain": .number(0.1), "release": .number(0.1)]),
            ]),
            mappings: [
                SonificationMapping(
                    sourceField: "titleLength",
                    targetParam: "scaleIndex",
                    inputRange: [0, 50],
                    outputRange: [0, 12],
                    curve: .linear,
                    invert: false
                ),
                SonificationMapping(
                    sourceField: "absLengthDelta",
                    targetParam: "velocity",
                    inputRange: [0, 500],
                    outputRange: [0.05, 1],
                    curve: .exp,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio,
            eventCooldownMs: 160,
            eventTriggerThreshold: 0.08,
            eventBurstCap: 4,
            eventBurstWindowMs: 1500,
            eventArticulation: .neutral,
            smoothingMs: nil,
            preMapWindow: 3,
            preMapStatistic: .median,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 98,
            alertTier: .abnormal,
            beaconThreshold: 0.8,
            beaconPeriodicSec: 0,
            beaconOnExtrema: true,
            hybridAccent: 0.6,
            sampleSource: "vinyl",
            samplePlaybackRateMin: 0.9,
            samplePlaybackRateMax: 1.4,
            sampleDensity: 2.2,
            sampleFilterCutoff: 3500,
            sampleReverbSend: 0.15,
            entityField: nil,
            patternType: nil,
            intent: "chimes"
        )

        // Archive: triggered FMSynth kalimba — mediatype selects pitch, title length drives velocity
        result["archive"] = ChannelConfig(
            streamId: "archive",
            enabled: true,
            mode: "triggered",
            synthType: "FMSynth",
            volume: -10,
            pan: 0.15,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("sine")]),
                "envelope": .object([
                    "attack": .number(0.001), "decay": .number(0.6),
                    "sustain": .number(0), "release": .number(0.8),
                ]),
                "modulationIndex": .number(3),
                "harmonicity": .number(8),
                "modulation": .object(["type": .string("sine")]),
                "modulationEnvelope": .object([
                    "attack": .number(0.001), "decay": .number(0.3),
                    "sustain": .number(0), "release": .number(0.4),
                ]),
            ]),
            mappings: [
                SonificationMapping(sourceField: "mediatypeIndex", targetParam: "scaleIndex", inputRange: [0, 7], outputRange: [0, 14], curve: .step, invert: false),
                SonificationMapping(sourceField: "titleLength", targetParam: "velocity", inputRange: [1, 100], outputRange: [0.2, 0.7], curve: .log, invert: false),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio,
            eventCooldownMs: 100,
            eventTriggerThreshold: 0,
            eventBurstCap: 6,
            eventBurstWindowMs: 1500,
            eventArticulation: .soft,
            smoothingMs: nil,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.5,
            sampleDensity: 1,
            sampleFilterCutoff: 4000,
            sampleReverbSend: 0,
            entityField: nil,
            patternType: nil,
            intent: "kalimba"
        )

        // RSS: triggered pluck, matches web default
        // Web: mode=triggered, behaviorType=event, volume=-10
        result["rss"] = ChannelConfig(
            streamId: "rss",
            enabled: false,
            mode: "triggered",
            synthType: "PluckSynth",
            volume: -10,
            pan: -0.3,
            mute: true,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(sourceField: "titleLength", targetParam: "scaleIndex", inputRange: [0, 80], outputRange: [0, 12], curve: .linear, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
                SonificationMapping(sourceField: "contentLength", targetParam: "velocity", inputRange: [0, 1000], outputRange: [0.1, 0.8], curve: .log, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio,
            eventCooldownMs: 220,
            eventTriggerThreshold: 0.04,
            eventBurstCap: 3,
            eventBurstWindowMs: 1400,
            eventArticulation: .soft,
            smoothingMs: nil,
            preMapWindow: 3,
            preMapStatistic: .median,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 98,
            alertTier: .advisory,
            beaconThreshold: 0.85,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "chimes",
            samplePlaybackRateMin: 0.9,
            samplePlaybackRateMax: 1.3,
            sampleDensity: 1.8,
            sampleFilterCutoff: 4200,
            sampleReverbSend: 0.2,
            entityField: nil,
            patternType: nil,
            intent: "plucks"
        )

        // Stocks: triggered membrane, matches web default
        // Web: mode=triggered, behaviorType=event, volume=-10
        result["stocks"] = ChannelConfig(
            streamId: "stocks",
            enabled: false,
            mode: "triggered",
            synthType: "MembraneSynth",
            volume: -10,
            pan: 0.3,
            mute: true,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(sourceField: "priceDeltaPct", targetParam: "velocity", inputRange: [0, 5], outputRange: [0.1, 1], curve: .exp, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
                SonificationMapping(sourceField: "direction", targetParam: "scaleIndex", inputRange: [0, 1], outputRange: [0, 4], curve: .step, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio,
            eventCooldownMs: 180,
            eventTriggerThreshold: 0.1,
            eventBurstCap: 5,
            eventBurstWindowMs: 1500,
            eventArticulation: .punchy,
            smoothingMs: nil,
            preMapWindow: 5,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 97,
            alertTier: .critical,
            beaconThreshold: 0.9,
            beaconPeriodicSec: 0,
            beaconOnExtrema: true,
            hybridAccent: 0.6,
            sampleSource: "vinyl",
            samplePlaybackRateMin: 0.85,
            samplePlaybackRateMax: 1.5,
            sampleDensity: 2.4,
            sampleFilterCutoff: 2800,
            sampleReverbSend: 0.12,
            entityField: nil,
            patternType: nil,
            intent: "heartbeat"
        )

        return result
    }

    /// Create a default system health sub-channel (matches web createSystemChannelConfig).
    /// Fixed pitch per metric, data drives buzziness/volume via FM modulation.
    private static let systemVoices: [String: (frequency: Double, pan: Double, harmonicity: Double)] = [
        "cpu":    (220, -0.5, 1),
        "memory": (330, 0,    2),
        "disk":   (165, 0.5,  1.5),
    ]

    static func makeSystemSubChannel(streamId: String, metricName: String) -> ChannelConfig {
        let v = systemVoices[metricName] ?? (262, 0, 1.5)
        return ChannelConfig(
            streamId: streamId,
            enabled: true,
            mode: "continuous",
            synthType: "FMSynth",
            volume: -30,
            pan: v.pan,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("sine")]),
                "envelope": .object(["attack": .number(1.5), "decay": .number(0.8), "sustain": .number(0.9), "release": .number(3.0)]),
                "harmonicity": .number(v.harmonicity),
                "modulationIndex": .number(0.5),
                "modulation": .object(["type": .string("sine")]),
            ]),
            mappings: [
                SonificationMapping(sourceField: "percent", targetParam: "frequency", inputRange: [0, 100], outputRange: [v.frequency, v.frequency], curve: .step, invert: false),
                SonificationMapping(sourceField: "percent", targetParam: "velocity", inputRange: [0, 100], outputRange: [0.03, 0.25], curve: .exp, invert: false),
                SonificationMapping(sourceField: "percent", targetParam: "modulationIndex", inputRange: [0, 100], outputRange: [0.5, 15], curve: .exp, invert: false),
                SonificationMapping(sourceField: "percent", targetParam: "filterCutoff", inputRange: [0, 100], outputRange: [400, 4000], curve: .linear, invert: false),
            ],
            effects: [
                Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 400, "Q": 0.7]),
                Effect(type: "reverb", wet: 0.4, bypass: false, params: ["decay": 4.2, "preDelay": 0.02]),
            ],
            behaviorType: .ambient,
            ambientMode: .sustain,
            smoothingMs: 2000,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.5,
            sampleDensity: 1,
            sampleFilterCutoff: 4000,
            sampleReverbSend: 0,
            entityField: "spanName",
            patternType: nil,
            intent: "drone",
            parentPluginId: "otlp"
        )
    }

    /// Create a default Apple Watch sub-channel (matches web createWatchChannelConfig).
    /// Heart rate + active energy: continuous FMSynth drones. Steps: triggered MembraneSynth.
    private static let watchVoices: [String: (frequency: Double, pan: Double, mode: String, synthType: String)] = [
        "heartRate":    (174, -0.3, "continuous", "FMSynth"),    // F3 — overridden to pattern
        "steps":        (0,   0.3,  "triggered",  "MembraneSynth"),
    ]

    static func makeWatchSubChannel(streamId: String, metricName: String) -> ChannelConfig {
        let v = watchVoices[metricName] ?? (174, 0, "continuous", "FMSynth")
        let isTriggered = v.mode == "triggered"

        // Heart rate uses arpeggio pattern — BPM drives pattern selection + velocity
        if metricName == "heartRate" {
            return ChannelConfig(
                streamId: streamId,
                enabled: true,
                mode: "pattern",
                synthType: "Synth",
                volume: -12,
                pan: -0.3,
                mute: false,
                solo: false,
                synthOptions: .init(["oscillator": .object(["type": .string("sine")])]),
                mappings: [
                    SonificationMapping(sourceField: "bpm", targetParam: "patternSelect", inputRange: [40, 180], outputRange: [0, 2], curve: .step, invert: false),
                    SonificationMapping(sourceField: "bpm", targetParam: "velocity", inputRange: [40, 180], outputRange: [0.1, 0.6], curve: .exp, invert: false),
                ],
                effects: [],
                behaviorType: .ambient,
                ambientMode: .arpeggio,
                smoothingMs: 1200,
                preMapWindow: 1,
                preMapStatistic: .mean,
                preMapChangeThreshold: 0,
                preMapDerivative: false,
                preMapPercentileClamp: 100,
                alertTier: .advisory,
                beaconThreshold: 0,
                beaconPeriodicSec: 0,
                beaconOnExtrema: false,
                hybridAccent: 0.6,
                sampleSource: "",
                samplePlaybackRateMin: 0.8,
                samplePlaybackRateMax: 1.5,
                sampleDensity: 1,
                sampleFilterCutoff: 4000,
                sampleReverbSend: 0,
                entityField: nil,
                patternType: "walk",
                intent: "pure",
                parentPluginId: "otlp"
            )
        }

        let mappings: [SonificationMapping]
        if metricName == "steps" {
            mappings = [
                SonificationMapping(sourceField: "stepDelta", targetParam: "velocity", inputRange: [0, 200], outputRange: [0.15, 0.8], curve: .log, invert: false),
                SonificationMapping(sourceField: "stepDelta", targetParam: "scaleIndex", inputRange: [0, 200], outputRange: [0, 7], curve: .linear, invert: false),
            ]
        } else {
            // fallback
            mappings = [
                SonificationMapping(sourceField: "percent", targetParam: "velocity", inputRange: [0, 100], outputRange: [0.05, 0.3], curve: .linear, invert: false),
            ]
        }

        return ChannelConfig(
            streamId: streamId,
            enabled: true,
            mode: v.mode,
            synthType: v.synthType,
            volume: isTriggered ? -10 : -30,
            pan: v.pan,
            mute: false,
            solo: false,
            synthOptions: isTriggered
                ? .init()
                : .init([
                    "oscillator": .object(["type": .string("sine")]),
                    "envelope": .object(["attack": .number(1.5), "decay": .number(0.8), "sustain": .number(0.9), "release": .number(3.0)]),
                    "harmonicity": .number(1),
                    "modulationIndex": .number(0.3),
                    "modulation": .object(["type": .string("sine")]),
                ]),
            mappings: mappings,
            effects: isTriggered
                ? []
                : [
                    Effect(type: "filter", wet: 1, bypass: false, params: ["frequency": 300, "Q": 0.7]),
                    Effect(type: "reverb", wet: 0.4, bypass: false, params: ["decay": 5, "preDelay": 0.02]),
                ],
            behaviorType: isTriggered ? .event : .ambient,
            ambientMode: isTriggered ? .arpeggio : .sustain,
            eventCooldownMs: isTriggered ? 500 : nil,
            eventTriggerThreshold: 0,
            eventBurstCap: isTriggered ? 4 : 0,
            eventBurstWindowMs: isTriggered ? 1000 : 1200,
            eventArticulation: isTriggered ? .punchy : .neutral,
            smoothingMs: isTriggered ? nil : metricName == "heartRate" ? 3000 : 5000,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.5,
            sampleDensity: 1,
            sampleFilterCutoff: 4000,
            sampleReverbSend: 0,
            entityField: isTriggered ? nil : "spanName",
            patternType: nil,
            intent: isTriggered ? "heartbeat" : "drone",
            parentPluginId: "otlp"
        )
    }

    /// Create a default browser sub-channel (matches web createBrowserChannelConfig).
    static func makeBrowserSubChannel(streamId: String, serviceName: String) -> ChannelConfig {
        let isContinuous = ["battery", "cpu", "memory"].contains(serviceName)
        let isBattery = serviceName == "battery"

        let mappings: [SonificationMapping]
        if isBattery {
            mappings = [
                SonificationMapping(sourceField: "level", targetParam: "frequency", inputRange: [0, 100], outputRange: [80, 220], curve: .linear, invert: false),
                SonificationMapping(sourceField: "level", targetParam: "velocity", inputRange: [0, 100], outputRange: [0.8, 0.05], curve: .linear, invert: false),
            ]
        } else if serviceName == "cpu" {
            mappings = [
                SonificationMapping(sourceField: "usagePercent", targetParam: "frequency", inputRange: [0, 100], outputRange: [110, 440], curve: .linear, invert: false),
                SonificationMapping(sourceField: "usagePercent", targetParam: "velocity", inputRange: [0, 100], outputRange: [0.1, 0.6], curve: .linear, invert: false),
            ]
        } else if serviceName == "memory" {
            mappings = [
                SonificationMapping(sourceField: "usedPercent", targetParam: "frequency", inputRange: [0, 100], outputRange: [130, 350], curve: .linear, invert: false),
                SonificationMapping(sourceField: "usedPercent", targetParam: "velocity", inputRange: [0, 100], outputRange: [0.1, 0.5], curve: .linear, invert: false),
            ]
        } else {
            mappings = [
                SonificationMapping(sourceField: "tabCount", targetParam: "scaleIndex", inputRange: [0, 30], outputRange: [0, 12], curve: .linear, invert: false),
            ]
        }

        return ChannelConfig(
            streamId: streamId,
            enabled: true,
            mode: isContinuous ? "continuous" : "triggered",
            synthType: "Synth",
            volume: isBattery ? -35 : isContinuous ? -25 : -8,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("sine")]),
                "envelope": isContinuous
                    ? .object(["attack": .number(0.5), "decay": .number(0.3), "sustain": .number(0.8), "release": .number(1.0)])
                    : .object(["attack": .number(0.01), "decay": .number(0.2), "sustain": .number(0.1), "release": .number(0.3)]),
            ]),
            mappings: mappings,
            effects: [],
            behaviorType: isContinuous ? .ambient : .event,
            ambientMode: isContinuous ? .sustain : .arpeggio,
            smoothingMs: isContinuous ? 2000 : nil,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.5,
            sampleDensity: 1,
            sampleFilterCutoff: 4000,
            sampleReverbSend: 0,
            entityField: nil,
            patternType: nil,
            parentPluginId: "otlp"
        )
    }

    /// Create a default OTLP sub-channel config (matches web createOtlpChannelConfig)
    static func makeOtlpSubChannel(streamId: String, serviceName: String) -> ChannelConfig {
        ChannelConfig(
            streamId: streamId,
            enabled: true,
            mode: "triggered",
            synthType: "Synth",
            volume: -8,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init([
                "oscillator": .object(["type": .string("triangle")]),
                "envelope": .object([
                    "attack": .number(0.01),
                    "decay": .number(0.25),
                    "sustain": .number(0.1),
                    "release": .number(0.3),
                ]),
            ]),
            mappings: [
                SonificationMapping(sourceField: "durationMs", targetParam: "scaleIndex", inputRange: [1, 10000], outputRange: [0, 14], curve: .log, invert: false),
                SonificationMapping(sourceField: "durationMs", targetParam: "duration", inputRange: [1, 10000], outputRange: [0.2, 1.2], curve: .log, invert: false),
                SonificationMapping(sourceField: "isError", targetParam: "velocity", inputRange: [0, 1], outputRange: [0.45, 0.65], curve: .step, invert: false),
                SonificationMapping(sourceField: "isError", targetParam: "filterCutoff", inputRange: [0, 1], outputRange: [6000, 1200], curve: .step, invert: false),
                SonificationMapping(sourceField: "isError", targetParam: "detune", inputRange: [0, 1], outputRange: [0, 150], curve: .step, invert: false),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio,
            eventCooldownMs: 50,
            eventTriggerThreshold: 0,
            eventBurstCap: 8,
            eventBurstWindowMs: 1000,
            eventArticulation: .neutral,
            smoothingMs: nil,
            preMapWindow: 1,
            preMapStatistic: .mean,
            preMapChangeThreshold: 0,
            preMapDerivative: false,
            preMapPercentileClamp: 100,
            alertTier: .advisory,
            beaconThreshold: 0,
            beaconPeriodicSec: 0,
            beaconOnExtrema: false,
            hybridAccent: 0.6,
            sampleSource: "",
            samplePlaybackRateMin: 0.8,
            samplePlaybackRateMax: 1.5,
            sampleDensity: 1.5,
            sampleFilterCutoff: 3000,
            sampleReverbSend: 0.2,
            entityField: nil,
            patternType: nil,
            intent: "chimes",
            parentPluginId: "otlp"
        )
    }
}
