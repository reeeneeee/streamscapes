import SwiftUI
import Observation

@Observable
final class AppStore {
    // MARK: - State
    var isPlaying = false
    var global = GlobalConfig.default
    var channels: [String: ChannelConfig] = AppStore.makeDefaultChannels()
    var activeStreams: [String: StreamState] = [:]
    var selectedChannelId: String? = "weather"
    var lockGlobalFrame: Bool = true

    /// Called after every mutation that should trigger engine reconciliation.
    var onReconcileNeeded: (() -> Void)?

    enum StreamState {
        case connecting
        case connected
        case error(String)
    }

    // MARK: - Derived
    var channelIds: [String] { Array(channels.keys.sorted()) }

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
    }

    func updateGlobal(_ update: (inout GlobalConfig) -> Void) {
        update(&global)
        onReconcileNeeded?()
    }

    func setPlaying(_ playing: Bool) {
        isPlaying = playing
    }

    func setStreamState(_ id: String, _ state: StreamState?) {
        activeStreams[id] = state
    }

    func applyPreset(_ preset: BuiltinPreset) {
        channels = preset.channels
        if !lockGlobalFrame {
            global = preset.global
        }
        selectedChannelId = channels.first(where: { $0.value.enabled })?.key ?? channels.keys.sorted().first
        onReconcileNeeded?()
    }

    func applyGenericSettingsAll() {
        channels = Self.makeDefaultChannels()
        selectedChannelId = "weather"
        onReconcileNeeded?()
    }

    // MARK: - Defaults
    static func makeDefaultChannels() -> [String: ChannelConfig] {
        var result: [String: ChannelConfig] = [:]

        // Weather: arpeggio pattern, matches web default
        // Web: mode=pattern, behaviorType=ambient, ambientMode=arpeggio, volume=0
        result["weather"] = ChannelConfig(
            streamId: "weather",
            enabled: true,
            mode: "pattern",
            synthType: "Synth",
            volume: -6,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init(envelope: .init(attack: 0.08, decay: 0.4, sustain: 0.3, release: 0.8)),
            mappings: [
                SonificationMapping(
                    sourceField: "feelsLike",
                    targetParam: "patternSelect",
                    inputRange: [0, 100],
                    outputRange: [0, 2],
                    curve: .step,
                    invert: false
                ),
                SonificationMapping(
                    sourceField: "clouds",
                    targetParam: "amplitude",
                    inputRange: [0, 100],
                    outputRange: [0.01, 0.06],
                    curve: .linear,
                    invert: true
                ),
            ],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .arpeggio,
            eventCooldownMs: nil,
            eventTriggerThreshold: 0,
            eventBurstCap: 0,
            eventBurstWindowMs: 1200,
            eventArticulation: .neutral,
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
            patternType: "upDown"
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
            synthOptions: .init(envelope: .init(attack: 0.2, decay: 0.3, sustain: 0.5, release: 1.0)),
            mappings: [
                SonificationMapping(
                    sourceField: "frequency",
                    targetParam: "frequency",
                    inputRange: [110, 880],
                    outputRange: [110, 440],
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
            patternType: nil
        )

        // Wikipedia: triggered notes, matches web default
        // Web: mode=triggered, behaviorType=event, volume=1
        result["wikipedia"] = ChannelConfig(
            streamId: "wikipedia",
            enabled: true,
            mode: "triggered",
            synthType: "Synth",
            volume: -4,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init(envelope: .init(attack: 0.02, decay: 0.3, sustain: 0.05, release: 0.4)),
            mappings: [
                SonificationMapping(
                    sourceField: "titleLength",
                    targetParam: "frequency",
                    inputRange: [0, 50],
                    outputRange: [130, 440],
                    curve: .linear,
                    invert: false
                ),
                SonificationMapping(
                    sourceField: "absLengthDelta",
                    targetParam: "amplitude",
                    inputRange: [0, 500],
                    outputRange: [0.03, 0.2],
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
            patternType: nil
        )

        // RSS: triggered pluck, matches web default
        // Web: mode=triggered, behaviorType=event, volume=-5
        result["rss"] = ChannelConfig(
            streamId: "rss",
            enabled: false,
            mode: "triggered",
            synthType: "PluckSynth",
            volume: -5,
            pan: -0.3,
            mute: true,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(sourceField: "titleLength", targetParam: "frequency", inputRange: [0, 80], outputRange: [220, 880], curve: .linear, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
                SonificationMapping(sourceField: "contentLength", targetParam: "amplitude", inputRange: [0, 1000], outputRange: [0.1, 0.5], curve: .log, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
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
            patternType: nil
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
                SonificationMapping(sourceField: "priceDeltaPct", targetParam: "amplitude", inputRange: [0, 5], outputRange: [0.1, 0.9], curve: .exp, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
                SonificationMapping(sourceField: "direction", targetParam: "frequency", inputRange: [0, 1], outputRange: [220, 440], curve: .step, invert: false, smoothingMs: nil, quantizeStep: nil, hysteresis: nil),
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
            patternType: nil
        )

        return result
    }
}
