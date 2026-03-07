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
    }

    func updateGlobal(_ update: (inout GlobalConfig) -> Void) {
        update(&global)
    }

    func setPlaying(_ playing: Bool) {
        isPlaying = playing
    }

    func setStreamState(_ id: String, _ state: StreamState?) {
        activeStreams[id] = state
    }

    // MARK: - Defaults
    static func makeDefaultChannels() -> [String: ChannelConfig] {
        var result: [String: ChannelConfig] = [:]

        // Weather: temperature → frequency, clouds → amplitude
        result["weather"] = ChannelConfig(
            streamId: "weather",
            enabled: true,
            mode: "continuous",
            synthType: "sine",
            volume: 0,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(
                    sourceField: "feelsLike",
                    targetParam: "frequency",
                    inputRange: [-10, 40],
                    outputRange: [220, 660],
                    curve: .linear,
                    invert: false
                ),
                SonificationMapping(
                    sourceField: "clouds",
                    targetParam: "amplitude",
                    inputRange: [0, 100],
                    outputRange: [0.05, 0.4],
                    curve: .linear,
                    invert: true
                ),
            ],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .arpeggio
        )

        // Flights: altitude → frequency, speed → amplitude
        result["flights"] = ChannelConfig(
            streamId: "flights",
            enabled: true,
            mode: "continuous",
            synthType: "sine",
            volume: -20,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(
                    sourceField: "altitude",
                    targetParam: "frequency",
                    inputRange: [0, 40000],
                    outputRange: [110, 880],
                    curve: .log,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .ambient,
            ambientMode: .sustain
        )

        // Wikipedia: titleLength → frequency, absLengthDelta → amplitude
        result["wikipedia"] = ChannelConfig(
            streamId: "wikipedia",
            enabled: true,
            mode: "triggered",
            synthType: "sine",
            volume: 1,
            pan: 0,
            mute: false,
            solo: false,
            synthOptions: .init(envelope: .init(attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1)),
            mappings: [
                SonificationMapping(
                    sourceField: "titleLength",
                    targetParam: "frequency",
                    inputRange: [0, 50],
                    outputRange: [330, 990],
                    curve: .linear,
                    invert: false
                ),
                SonificationMapping(
                    sourceField: "absLengthDelta",
                    targetParam: "amplitude",
                    inputRange: [0, 500],
                    outputRange: [0.05, 0.6],
                    curve: .exp,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio
        )

        // RSS
        result["rss"] = ChannelConfig(
            streamId: "rss",
            enabled: true,
            mode: "triggered",
            synthType: "pluck",
            volume: -5,
            pan: -0.3,
            mute: false,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(
                    sourceField: "titleLength",
                    targetParam: "frequency",
                    inputRange: [0, 80],
                    outputRange: [220, 880],
                    curve: .linear,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio
        )

        // Stocks
        result["stocks"] = ChannelConfig(
            streamId: "stocks",
            enabled: true,
            mode: "triggered",
            synthType: "membrane",
            volume: -10,
            pan: 0.3,
            mute: false,
            solo: false,
            synthOptions: .init(),
            mappings: [
                SonificationMapping(
                    sourceField: "priceDeltaPct",
                    targetParam: "amplitude",
                    inputRange: [0, 5],
                    outputRange: [0.1, 0.8],
                    curve: .exp,
                    invert: false
                ),
            ],
            effects: [],
            behaviorType: .event,
            ambientMode: .arpeggio
        )

        return result
    }
}
