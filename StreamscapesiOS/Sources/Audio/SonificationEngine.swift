import AudioKit
import AudioKitEX
import SoundpipeAudioKit
import AVFoundation
import Foundation

@MainActor
final class SonificationEngine {
    private var engine = AudioEngine()
    private var mixer = Mixer()
    private var channels: [String: ChannelNode] = [:]
    private var channelModes: [String: String] = [:]
    private var isStarted = false
    private var arpeggioTasks: [String: Task<Void, Never>] = [:]
    private var mappingState: [String: [String: (value: Double, updatedAt: Date)]] = [:]
    private var lastTriggeredAt: [String: Date] = [:]
    private var eventHistory: [String: [Date]] = [:]
    private var lastEventMetric: [String: Double] = [:]

    struct ChannelNode {
        let oscillator: DynamicOscillator
        let filter: LowPassButterworthFilter
        let panner: Panner
        let fader: Fader
    }

    // C major pentatonic across 3 octaves
    static let scaleFrequencies: [Double] = [
        130.81, 146.83, 164.81, 196.00, 220.00,  // C3 D3 E3 G3 A3
        261.63, 293.66, 329.63, 392.00, 440.00,  // C4 D4 E4 G4 A4
        523.25, 587.33, 659.25, 783.99, 880.00,  // C5 D5 E5 G5 A5
    ]

    init() {
        engine.output = mixer
    }

    func start() throws {
        guard !isStarted else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)
        try engine.start()
        isStarted = true
    }

    func stop() {
        for (_, task) in arpeggioTasks { task.cancel() }
        arpeggioTasks.removeAll()
        engine.stop()
        channels.removeAll()
        channelModes.removeAll()
        mappingState.removeAll()
        lastTriggeredAt.removeAll()
        eventHistory.removeAll()
        lastEventMetric.removeAll()
        isStarted = false
    }

    // MARK: - Channel management

    func ensureChannel(id: String, config: ChannelConfig) {
        guard channels[id] == nil else { return }

        let osc = DynamicOscillator()
        osc.setWaveform(Table(.sine))
        let lpf = LowPassButterworthFilter(osc, cutoffFrequency: 900)
        let panner = Panner(lpf)
        let fader = Fader(panner)

        osc.start()
        osc.amplitude = 0
        osc.frequency = 130.81 // C3 — warm starting pitch

        channelModes[id] = config.mode
        mixer.addInput(fader)
        channels[id] = ChannelNode(oscillator: osc, filter: lpf, panner: panner, fader: fader)

        // Start arpeggio for ambient channels
        if config.behaviorType == .ambient && config.ambientMode == .arpeggio {
            startArpeggio(id: id)
        }
    }

    func removeChannel(id: String) {
        arpeggioTasks[id]?.cancel()
        arpeggioTasks.removeValue(forKey: id)
        guard let node = channels[id] else { return }
        node.oscillator.stop()
        mixer.removeInput(node.fader)
        channels.removeValue(forKey: id)
        channelModes.removeValue(forKey: id)
    }

    // MARK: - Arpeggio

    private func startArpeggio(id: String) {
        arpeggioTasks[id]?.cancel()

        // Pick notes in the scale based on channel — favor warm lower registers
        let noteIndices: [Int]
        switch id {
        case "weather":
            noteIndices = [0, 2, 4, 2, 0, 3, 5, 3] // C3 E3 A3 E3 C3 G3 C4 G3
        case "flights":
            noteIndices = [0, 2, 4, 2] // C3 E3 A3 E3 — low register
        default:
            noteIndices = [0, 2, 4, 5] // C3 E3 A3 C4
        }

        arpeggioTasks[id] = Task { @MainActor in
            var step = 0
            while !Task.isCancelled {
                guard let node = self.channels[id] else { break }

                let idx = noteIndices[step % noteIndices.count]
                let freq = Self.scaleFrequencies[idx]
                node.oscillator.frequency = AUValue(freq)

                // Gentle swell per note — keep amplitude soft
                let baseAmp = node.oscillator.amplitude
                let peakAmp = max(baseAmp, 0.04)
                node.oscillator.amplitude = AUValue(peakAmp)

                // Note duration: ~600ms for a relaxed feel
                try? await Task.sleep(for: .milliseconds(600))

                // Gradual dip between notes
                node.oscillator.amplitude = AUValue(peakAmp * 0.7)
                try? await Task.sleep(for: .milliseconds(80))

                step += 1
            }
        }
    }

    // MARK: - Reconcile

    func reconcile(store: AppStore) {
        let masterDb = store.global.masterVolume
        mixer.volume = AUValue(dbToLinear(masterDb))

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
        if config.behaviorType == .ambient && config.ambientMode == .arpeggio {
            if arpeggioTasks[id] == nil { startArpeggio(id: id) }
        } else {
            arpeggioTasks[id]?.cancel()
            arpeggioTasks[id] = nil
        }
    }

    // MARK: - Data handling

    func handleDataPoint(_ dp: DataPoint, config: ChannelConfig, global: GlobalConfig) {
        guard let node = channels[dp.streamId] else { return }

        let mapped = applyMappings(streamId: dp.streamId, timestamp: dp.timestamp, dp: dp, mappings: config.mappings)

        if config.mode == "triggered" {
            if shouldTrigger(streamId: dp.streamId, config: config, mapped: mapped) {
                triggerNote(id: dp.streamId, node: node, mapped: mapped, envelope: config.synthOptions.envelope, articulation: config.eventArticulation ?? .neutral)
            }
        } else {
            // Continuous: update amplitude from data, frequency handled by arpeggio
            if let amp = mapped["amplitude"] {
                node.oscillator.amplitude = AUValue(amp)
            }
            // If not arpeggiated, allow direct frequency control
            if config.ambientMode != .arpeggio, let freq = mapped["frequency"] {
                node.oscillator.frequency = AUValue(quantizeToScale(freq))
            }
        }
    }

    // MARK: - Triggered notes

    private func triggerNote(
        id: String,
        node: ChannelNode,
        mapped: [String: Double],
        envelope: ChannelConfig.SynthOptions.Envelope?,
        articulation: ChannelConfig.Articulation
    ) {
        var env = envelope ?? .init(attack: 0.02, decay: 0.3, sustain: 0.0, release: 0.5)
        switch articulation {
        case .soft:
            env.attack = max(env.attack, 0.04)
            env.decay = max(env.decay, 0.4)
            env.release = max(env.release, 0.7)
        case .punchy:
            env.attack = min(env.attack, 0.01)
            env.decay = min(env.decay, 0.15)
            env.release = min(env.release, 0.25)
        case .neutral:
            break
        }

        // Quantize frequency to scale
        if let freq = mapped["frequency"] {
            node.oscillator.frequency = AUValue(quantizeToScale(freq))
        }

        let peakAmp = AUValue(mapped["amplitude"] ?? 0.15)

        let attackMs = Int(env.attack * 1000)
        let decayMs = Int(env.decay * 1000)
        let releaseMs = Int(env.release * 1000)
        let sustainLevel = AUValue(env.sustain) * peakAmp

        // Start from silence and ramp up to avoid click
        node.oscillator.amplitude = 0

        Task { @MainActor in
            // Attack: ramp to peak
            try? await Task.sleep(for: .milliseconds(max(attackMs, 5)))
            guard self.channels[id] != nil else { return }
            node.oscillator.amplitude = peakAmp

            // Decay: settle to sustain level
            try? await Task.sleep(for: .milliseconds(decayMs))
            guard self.channels[id] != nil else { return }
            node.oscillator.amplitude = sustainLevel

            // Release: fade to silence
            try? await Task.sleep(for: .milliseconds(releaseMs))
            guard self.channels[id] != nil else { return }
            node.oscillator.amplitude = 0
        }
    }

    private func shouldTrigger(streamId: String, config: ChannelConfig, mapped: [String: Double]) -> Bool {
        let now = Date()

        if let cooldown = config.eventCooldownMs, cooldown > 0 {
            let last = lastTriggeredAt[streamId] ?? .distantPast
            if now.timeIntervalSince(last) * 1000 < cooldown {
                return false
            }
        }

        let metric = mapped["amplitude"] ?? mapped["frequency"] ?? 0
        if let threshold = config.eventTriggerThreshold, threshold > 0 {
            let prev = lastEventMetric[streamId] ?? metric
            lastEventMetric[streamId] = metric
            if abs(metric - prev) < threshold {
                return false
            }
        }

        if let cap = config.eventBurstCap, cap > 0 {
            let windowMs = max(100, config.eventBurstWindowMs ?? 1200)
            var kept = (eventHistory[streamId] ?? []).filter { now.timeIntervalSince($0) * 1000 <= windowMs }
            if kept.count >= cap {
                eventHistory[streamId] = kept
                return false
            }
            kept.append(now)
            eventHistory[streamId] = kept
        }

        lastTriggeredAt[streamId] = now
        return true
    }

    // MARK: - Scale quantization

    private func quantizeToScale(_ freq: Double) -> Double {
        var closest = Self.scaleFrequencies[0]
        var minDist = abs(freq - closest)
        for f in Self.scaleFrequencies {
            let dist = abs(freq - f)
            if dist < minDist {
                minDist = dist
                closest = f
            }
        }
        return closest
    }

    // MARK: - Mapping engine

    private func applyMappings(streamId: String, timestamp: Date, dp: DataPoint, mappings: [SonificationMapping]) -> [String: Double] {
        var result: [String: Double] = [:]
        for mapping in mappings {
            guard let value = dp.fields[mapping.sourceField] else { continue }
            var out = mapValue(
                value: value,
                inputRange: mapping.inputRange,
                outputRange: mapping.outputRange,
                curve: mapping.curve,
                invert: mapping.invert
            )
            if let step = mapping.quantizeStep, step > 0 {
                out = (out / step).rounded() * step
            }
            var streamState = mappingState[streamId] ?? [:]
            if let h = mapping.hysteresis, h > 0, let prev = streamState[mapping.targetParam]?.value, abs(out - prev) < h {
                out = prev
            }
            if let smoothing = mapping.smoothingMs, smoothing > 0, let prev = streamState[mapping.targetParam] {
                let dt = max(1, timestamp.timeIntervalSince(prev.updatedAt) * 1000)
                let alpha = min(1, dt / smoothing)
                out = prev.value + (out - prev.value) * alpha
            }
            streamState[mapping.targetParam] = (value: out, updatedAt: timestamp)
            mappingState[streamId] = streamState
            result[mapping.targetParam] = out
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

        var t = (value - inMin) / (inMax - inMin)
        t = min(1, max(0, t))

        switch curve {
        case .linear: break
        case .log: t = log10(1 + t * 9)
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
