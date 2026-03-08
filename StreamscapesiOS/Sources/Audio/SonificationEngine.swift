import AudioKit
import AudioKitEX
import SoundpipeAudioKit
import Foundation

@MainActor
final class SonificationEngine {
    private var engine = AudioEngine()
    private var mixer = Mixer()
    private var channels: [String: ChannelNode] = [:]
    private var isStarted = false

    struct ChannelNode {
        let oscillator: DynamicOscillator
        let panner: Panner
        let fader: Fader
    }

    init() {
        engine.output = mixer
    }

    func start() throws {
        guard !isStarted else { return }
        try engine.start()
        isStarted = true
    }

    func stop() {
        engine.stop()
        channels.removeAll()
        isStarted = false
    }

    // MARK: - Channel management

    func ensureChannel(id: String, config: ChannelConfig) {
        guard channels[id] == nil else { return }

        let osc = DynamicOscillator()
        let panner = Panner(osc)
        let fader = Fader(panner)

        osc.start()
        osc.amplitude = 0 // Start silent

        mixer.addInput(fader)
        channels[id] = ChannelNode(oscillator: osc, panner: panner, fader: fader)
    }

    func removeChannel(id: String) {
        guard let node = channels[id] else { return }
        node.oscillator.stop()
        mixer.removeInput(node.fader)
        channels.removeValue(forKey: id)
    }

    // MARK: - Reconcile store state

    func reconcile(store: AppStore) {
        // Master volume
        let masterDb = store.global.masterVolume
        mixer.volume = AUValue(dbToLinear(masterDb))

        // Per-channel
        for (id, config) in store.channels {
            if config.enabled && !config.mute {
                ensureChannel(id: id, config: config)
                applyChannel(id: id, config: config)
            } else {
                removeChannel(id: id)
            }
        }
    }

    func applyChannel(id: String, config: ChannelConfig) {
        guard let node = channels[id] else { return }
        node.fader.gain = AUValue(dbToLinear(config.volume))
        node.panner.pan = AUValue(config.pan)
    }

    // MARK: - Data handling

    func handleDataPoint(_ dp: DataPoint, config: ChannelConfig, global: GlobalConfig) {
        guard let node = channels[dp.streamId] else { return }

        // Apply mappings to derive synth parameters
        let mapped = applyMappings(dp: dp, mappings: config.mappings)

        if let freq = mapped["frequency"] {
            node.oscillator.frequency = AUValue(freq)
        }
        if let amp = mapped["amplitude"] {
            node.oscillator.amplitude = AUValue(amp)
        }
    }

    // MARK: - Mapping engine

    private func applyMappings(dp: DataPoint, mappings: [SonificationMapping]) -> [String: Double] {
        var result: [String: Double] = [:]
        for mapping in mappings {
            guard let value = dp.fields[mapping.sourceField] else { continue }
            let mapped = mapValue(
                value: value,
                inputRange: mapping.inputRange,
                outputRange: mapping.outputRange,
                curve: mapping.curve,
                invert: mapping.invert
            )
            result[mapping.targetParam] = mapped
        }
        return result
    }

    private func mapValue(
        value: Double,
        inputRange: [Double],
        outputRange: [Double],
        curve: SonificationMapping.CurveType,
        invert: Bool
    ) -> Double {
        guard inputRange.count == 2, outputRange.count == 2 else { return value }
        let inMin = inputRange[0], inMax = inputRange[1]
        let outMin = outputRange[0], outMax = outputRange[1]

        // Normalize to 0-1
        var t = (value - inMin) / (inMax - inMin)
        t = min(1, max(0, t))

        // Apply curve
        switch curve {
        case .linear: break
        case .log: t = log10(1 + t * 9) // log10(1..10) -> 0..1
        case .exp: t = (pow(10, t) - 1) / 9
        case .step: t = (t * 4).rounded(.down) / 4
        }

        if invert { t = 1 - t }
        return outMin + t * (outMax - outMin)
    }

    private func dbToLinear(_ db: Double) -> Double {
        db <= -40 ? 0 : pow(10, db / 20)
    }
}
