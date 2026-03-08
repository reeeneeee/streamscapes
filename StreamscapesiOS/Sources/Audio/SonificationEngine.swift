import AudioKit
import AudioKitEX
import SoundpipeAudioKit
import DunneAudioKit
import AVFoundation
import Foundation

@MainActor
final class SonificationEngine {
    private var engine = AudioEngine()
    private var mixer = Mixer()
    private var compressor: DynamicRangeCompressor!
    private var limiter: PeakLimiter!
    private var headroomFader: Fader!
    private var isStarted = false

    // MARK: - Channel state

    private var channels: [String: ChannelNode] = [:]
    private var channelKeys: [String: ChannelDiffKey] = [:]
    private var mappingState = MappingEngine.MappingState()
    private var eventState: [String: EventShaping.StreamState] = [:]
    private var lastDataPointByStream: [String: DataPoint] = [:]

    // Cached scale notes — recomputed when global config changes
    private var currentScaleNotes: [Int] = []
    private var lastRootNote = ""
    private var lastScale = ""

    // MARK: - Channel types

    enum ChannelNode {
        case triggered(TriggeredChannel)
        case continuous(ContinuousChannel)
        case pattern(PatternChannel)
    }

    struct TriggeredChannel {
        let synth: DunneAudioKit.Synth
        let fader: Fader
        let panner: Panner
    }

    struct ContinuousChannel {
        let oscillator: DynamicOscillator
        let envelope: AmplitudeEnvelope
        let fader: Fader
        let panner: Panner
    }

    struct PatternChannel {
        let synth: DunneAudioKit.Synth
        let fader: Fader
        let panner: Panner
        var timer: DispatchSourceTimer?
        var patternStep: Int = 0
    }

    /// Keys used for diff-based reconciliation — rebuild only when these change.
    struct ChannelDiffKey: Equatable {
        let mode: String
        let synthType: String
        let effectsKey: String
        let behaviorKey: String
        let patternType: String
    }

    // MARK: - Init & lifecycle

    init() {
        compressor = DynamicRangeCompressor(mixer)
        compressor.threshold = -24
        compressor.ratio = 4
        compressor.attackDuration = 0.01
        compressor.releaseDuration = 0.1
        limiter = PeakLimiter(compressor)
        headroomFader = Fader(limiter, gain: 0.891) // -1dB headroom for inter-sample peaks
        engine.output = headroomFader
    }

    func start() throws {
        guard !isStarted else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)

        // Listen for audio session interruptions (phone calls, Siri, etc.)
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            // Extract sendable values before crossing isolation boundary
            let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsValue = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
            Task { @MainActor in
                self?.handleInterruption(typeValue: typeValue, optionsValue: optionsValue)
            }
        }

        try engine.start()
        isStarted = true
    }

    func stop() {
        for id in Array(channels.keys) {
            disposeChannel(id: id, fadeOut: false)
        }
        engine.stop()
        channels.removeAll()
        channelKeys.removeAll()
        mappingState.removeAll()
        eventState.removeAll()
        lastDataPointByStream.removeAll()
        isStarted = false
    }

    private func handleInterruption(typeValue: UInt?, optionsValue: UInt?) {
        guard let typeValue,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        if type == .ended {
            let options = optionsValue.flatMap { AVAudioSession.InterruptionOptions(rawValue: $0) }
            if options?.contains(.shouldResume) == true {
                try? engine.start()
            }
        }
    }

    // MARK: - Scale management

    private func updateScale(global: GlobalConfig) {
        guard global.rootNote != lastRootNote || global.scale != lastScale else { return }
        lastRootNote = global.rootNote
        lastScale = global.scale
        currentScaleNotes = MusicScale.scaleNotes(rootNote: global.rootNote, scale: global.scale)
    }

    // MARK: - Channel creation

    private func createChannel(id: String, config: ChannelConfig) {
        switch config.mode {
        case "triggered":
            let env = config.synthOptions.envelope
            let synth = DunneAudioKit.Synth(
                masterVolume: 1.0,
                pitchBend: 0,
                vibratoDepth: 0,
                filterCutoff: 4,
                filterStrength: 20,
                filterResonance: 0,
                attackDuration: Float(env?.attack ?? 0.02),
                decayDuration: Float(env?.decay ?? 0.3),
                sustainLevel: Float(env?.sustain ?? 0.05),
                releaseDuration: Float(env?.release ?? 0.4),
                filterEnable: false
            )
            let panner = Panner(synth)
            let fader = Fader(panner)
            mixer.addInput(fader)
            channels[id] = .triggered(TriggeredChannel(synth: synth, fader: fader, panner: panner))

        case "continuous":
            let osc = DynamicOscillator()
            osc.setWaveform(Table(.sine))
            osc.amplitude = 0
            osc.frequency = 220
            let ampEnv = AmplitudeEnvelope(osc)
            ampEnv.attackDuration = AUValue(config.synthOptions.envelope?.attack ?? 0.2)
            ampEnv.decayDuration = AUValue(config.synthOptions.envelope?.decay ?? 0.3)
            ampEnv.sustainLevel = AUValue(config.synthOptions.envelope?.sustain ?? 0.5)
            ampEnv.releaseDuration = AUValue(config.synthOptions.envelope?.release ?? 1.0)
            let panner = Panner(ampEnv)
            let fader = Fader(panner)
            osc.start()
            ampEnv.start()
            osc.amplitude = 1 // envelope controls amplitude
            mixer.addInput(fader)
            channels[id] = .continuous(ContinuousChannel(oscillator: osc, envelope: ampEnv, fader: fader, panner: panner))

        case "pattern":
            let pEnv = config.synthOptions.envelope
            let synth = DunneAudioKit.Synth(
                masterVolume: 1.0,
                pitchBend: 0,
                vibratoDepth: 0,
                filterCutoff: 4,
                filterStrength: 20,
                filterResonance: 0,
                attackDuration: Float(pEnv?.attack ?? 0.08),
                decayDuration: Float(pEnv?.decay ?? 0.4),
                sustainLevel: Float(pEnv?.sustain ?? 0.3),
                releaseDuration: Float(pEnv?.release ?? 0.8),
                filterEnable: false
            )
            let panner = Panner(synth)
            let fader = Fader(panner)
            mixer.addInput(fader)
            var channel = PatternChannel(synth: synth, fader: fader, panner: panner)
            startPatternTimer(id: id, channel: &channel, config: config)
            channels[id] = .pattern(channel)

        default:
            print("[SonificationEngine] Unknown mode: \(config.mode)")
        }

        // Store diff key
        channelKeys[id] = diffKey(for: config)

        // Apply volume/pan
        updateChannel(id: id, config: config)
    }

    private func disposeChannel(id: String, fadeOut: Bool = true) {
        guard let node = channels[id] else { return }

        // Cancel any pattern timers
        if case .pattern(var ch) = node {
            ch.timer?.cancel()
            ch.timer = nil
        }

        // Remove from mixer
        let fader = channelFader(node)
        if fadeOut {
            // Ramp to silence over 40ms to prevent clicks
            fader.gain = 0
            // Schedule actual removal on next runloop tick
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                Task { @MainActor in
                    self?.mixer.removeInput(fader)
                }
            }
        } else {
            mixer.removeInput(fader)
        }

        // Stop nodes
        switch node {
        case .triggered(let ch):
            // DunneAudioKit.Synth stops automatically when removed from graph
            _ = ch
        case .continuous(let ch):
            ch.envelope.stop()
            ch.oscillator.stop()
        case .pattern(let ch):
            _ = ch
        }

        channels.removeValue(forKey: id)
        channelKeys.removeValue(forKey: id)
        MappingEngine.clearState(for: id, in: &mappingState)
        eventState.removeValue(forKey: id)
    }

    private func channelFader(_ node: ChannelNode) -> Fader {
        switch node {
        case .triggered(let ch): return ch.fader
        case .continuous(let ch): return ch.fader
        case .pattern(let ch): return ch.fader
        }
    }

    // MARK: - Channel update (config-only, no teardown)

    private func updateChannel(id: String, config: ChannelConfig) {
        guard let node = channels[id] else { return }
        let fader = channelFader(node)
        fader.gain = AUValue(dbToLinear(config.volume))

        switch node {
        case .triggered(let ch):
            ch.panner.pan = AUValue(config.pan)
            // Update envelope params in-place
            if let env = config.synthOptions.envelope {
                ch.synth.attackDuration = Float(env.attack)
                ch.synth.decayDuration = Float(env.decay)
                ch.synth.sustainLevel = Float(env.sustain)
                ch.synth.releaseDuration = Float(env.release)
            }

        case .continuous(let ch):
            ch.panner.pan = AUValue(config.pan)
            if let env = config.synthOptions.envelope {
                ch.envelope.attackDuration = AUValue(env.attack)
                ch.envelope.decayDuration = AUValue(env.decay)
                ch.envelope.sustainLevel = AUValue(env.sustain)
                ch.envelope.releaseDuration = AUValue(env.release)
            }

        case .pattern(var ch):
            ch.panner.pan = AUValue(config.pan)
            if let env = config.synthOptions.envelope {
                ch.synth.attackDuration = Float(env.attack)
                ch.synth.decayDuration = Float(env.decay)
                ch.synth.sustainLevel = Float(env.sustain)
                ch.synth.releaseDuration = Float(env.release)
            }
            channels[id] = .pattern(ch)
        }
    }

    // MARK: - Pattern timer

    private func startPatternTimer(id: String, channel: inout PatternChannel, config: ChannelConfig) {
        channel.timer?.cancel()

        let tempo = max(40, min(240, Double(lastRootNote.isEmpty ? 120 : 120))) // will be set from global
        let beatIntervalSec = 60.0 / tempo / 2.0 // eighth note subdivision

        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "com.streamscapes.pattern.\(id)", qos: .userInitiated))
        timer.schedule(deadline: .now() + beatIntervalSec, repeating: beatIntervalSec, leeway: .milliseconds(1))

        timer.setEventHandler { [weak self] in
            Task { @MainActor in
                self?.firePatternNote(id: id)
            }
        }

        timer.resume()
        channel.timer = timer
    }

    private func firePatternNote(id: String) {
        guard case .pattern(var ch) = channels[id] else { return }
        guard !currentScaleNotes.isEmpty else { return }

        let notes = currentScaleNotes
        let noteCount = notes.count
        guard noteCount > 0 else { return }

        // Pattern traversal
        let noteIndex: Int
        let step = ch.patternStep
        // Simple upDown pattern (most common)
        let cycleLength = max(1, noteCount * 2 - 2)
        let pos = step % cycleLength
        if pos < noteCount {
            noteIndex = pos
        } else {
            noteIndex = cycleLength - pos
        }

        let midiNote = notes[min(noteIndex, noteCount - 1)]
        let velocity = 80 // moderate velocity for patterns

        // Play note — DunneAudioKit.Synth handles voice management
        ch.synth.play(noteNumber: UInt8(midiNote), velocity: UInt8(velocity), channel: 0)

        // Schedule note-off after note duration (half the beat interval)
        let noteDurationMs = 250
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(noteDurationMs)) { [weak self] in
            Task { @MainActor in
                guard case .pattern(let currentCh) = self?.channels[id] else { return }
                currentCh.synth.stop(noteNumber: UInt8(midiNote), channel: 0)
            }
        }

        ch.patternStep = step + 1
        channels[id] = .pattern(ch)
    }

    func updatePatternTempo(global: GlobalConfig) {
        let tempo = max(40, min(240, Double(global.tempo)))
        let beatIntervalSec = 60.0 / tempo / 2.0

        for (id, node) in channels {
            if case .pattern(var ch) = node {
                ch.timer?.schedule(deadline: .now() + beatIntervalSec, repeating: beatIntervalSec, leeway: .milliseconds(1))
                channels[id] = .pattern(ch)
            }
        }
    }

    // MARK: - Reconcile

    private func diffKey(for config: ChannelConfig) -> ChannelDiffKey {
        let effectsKey = config.effects.map { "\($0.type):\($0.wet):\($0.bypass)" }.joined(separator: "|")
        let behaviorKey = "\(config.behaviorType.rawValue):\(config.ambientMode.rawValue)"
        return ChannelDiffKey(
            mode: config.mode,
            synthType: config.synthType,
            effectsKey: effectsKey,
            behaviorKey: behaviorKey,
            patternType: config.patternType ?? "upDown"
        )
    }

    func reconcile(channels configs: [String: ChannelConfig], global: GlobalConfig) {
        // Update master volume (applied to mixer, before compression)
        mixer.volume = AUValue(dbToLinear(global.masterVolume))

        // Update scale
        updateScale(global: global)

        // Update pattern tempos
        updatePatternTempo(global: global)

        // Determine which channels should be active
        let activeIds = Set(configs.filter { $0.value.enabled }.keys)
        let currentIds = Set(channels.keys)

        // Remove channels that are no longer active
        for id in currentIds.subtracting(activeIds) {
            disposeChannel(id: id)
        }

        // Create or update active channels
        for (id, config) in configs where config.enabled {
            let newKey = diffKey(for: config)

            if let existingKey = channelKeys[id] {
                if existingKey != newKey {
                    // Structural change — rebuild
                    disposeChannel(id: id)
                    createChannel(id: id, config: config)
                } else {
                    // Config-only change — update in-place
                    updateChannel(id: id, config: config)

                    // Handle mute: keep channel alive, just silence the fader
                    if config.mute {
                        channelFader(channels[id]!).gain = 0
                    }
                }
            } else {
                // New channel
                createChannel(id: id, config: config)
                if config.mute {
                    channelFader(channels[id]!).gain = 0
                }

                // Bootstrap from cached data point if available
                if let cachedDp = lastDataPointByStream[id] {
                    handleDataPoint(cachedDp, config: config, global: global)
                }
            }
        }
    }

    // Legacy reconcile method — bridges from old AppStore-based API
    func reconcile(store: AppStore) {
        reconcile(channels: store.channels, global: store.global)
    }

    // MARK: - Data handling

    func handleDataPoint(_ dp: DataPoint, config: ChannelConfig, global: GlobalConfig) {
        guard channels[dp.streamId] != nil else { return }

        // Cache for channel re-bootstrap
        lastDataPointByStream[dp.streamId] = dp

        // Ensure scale is current
        updateScale(global: global)

        // Apply mappings
        var mapped = MappingEngine.applyMappings(
            dataPoint: dp,
            mappings: config.mappings,
            state: &mappingState,
            stateKeyPrefix: dp.streamId
        )

        // Resolve scaleIndex → MIDI note number
        if let scaleIndex = mapped["scaleIndex"] {
            let midiNote = MusicScale.noteForScaleIndex(scaleIndex, notes: currentScaleNotes)
            mapped["_resolvedMidiNote"] = Double(midiNote)
            mapped["frequency"] = MusicScale.midiToFrequency(midiNote)
        } else if let freq = mapped["frequency"], !currentScaleNotes.isEmpty {
            // Quantize raw frequency to nearest scale note
            let targetMidi = 69 + 12 * log2(freq / 440.0)
            let closest = currentScaleNotes.min(by: { abs(Double($0) - targetMidi) < abs(Double($1) - targetMidi) }) ?? 60
            mapped["_resolvedMidiNote"] = Double(closest)
            mapped["frequency"] = MusicScale.midiToFrequency(closest)
        }

        switch config.mode {
        case "triggered":
            if EventShaping.shouldTrigger(streamId: dp.streamId, config: config, mapped: mapped, state: &eventState) {
                triggerNote(id: dp.streamId, config: config, mapped: mapped)
            }

        case "continuous":
            handleContinuousData(id: dp.streamId, mapped: mapped)

        case "pattern":
            handlePatternData(id: dp.streamId, mapped: mapped)

        default:
            break
        }
    }

    // MARK: - Triggered notes

    private func triggerNote(id: String, config: ChannelConfig, mapped: [String: Double]) {
        guard case .triggered(let ch) = channels[id] else { return }

        let midiNote: UInt8
        if let resolved = mapped["_resolvedMidiNote"] {
            midiNote = UInt8(max(0, min(127, Int(resolved))))
        } else {
            // Fallback: pick a note from the middle of the scale
            let midIndex = currentScaleNotes.count / 2
            midiNote = UInt8(currentScaleNotes.isEmpty ? 60 : currentScaleNotes[midIndex])
        }

        let rawVelocity = mapped["velocity"] ?? mapped["amplitude"] ?? 0.5
        let articulation = config.eventArticulation ?? .neutral
        let velocity = EventShaping.articulationVelocity(rawVelocity, articulation: articulation)
        let midiVelocity = UInt8(max(1, min(127, Int(velocity * 127))))

        ch.synth.play(noteNumber: midiNote, velocity: midiVelocity, channel: 0)

        // Schedule note-off based on duration target or envelope
        let durationMs: Int
        if let dur = mapped["duration"] {
            durationMs = max(50, Int(dur * 1000))
        } else {
            let env = config.synthOptions.envelope ?? .init(attack: 0.02, decay: 0.3, sustain: 0.05, release: 0.4)
            durationMs = Int((env.attack + env.decay) * 1000) + 50
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(durationMs)) { [weak self] in
            Task { @MainActor in
                guard case .triggered(let currentCh) = self?.channels[id] else { return }
                currentCh.synth.stop(noteNumber: midiNote, channel: 0)
            }
        }

        // Apply pan from mapped data
        if let pan = mapped["pan"] {
            ch.panner.pan = AUValue(max(-1, min(1, pan)))
        }
    }

    // MARK: - Continuous data

    private func handleContinuousData(id: String, mapped: [String: Double]) {
        guard case .continuous(let ch) = channels[id] else { return }

        if let freq = mapped["frequency"] {
            ch.oscillator.frequency = AUValue(freq)
        }
        if let amp = mapped["amplitude"] {
            ch.oscillator.amplitude = AUValue(max(0, min(1, amp)))
        }
        if let pan = mapped["pan"] {
            ch.panner.pan = AUValue(max(-1, min(1, pan)))
        }
    }

    // MARK: - Pattern data

    private func handlePatternData(id: String, mapped: [String: Double]) {
        guard case .pattern(let ch) = channels[id] else { return }

        // Pattern mode uses data to modulate volume/pan, not direct note control
        if let amp = mapped["amplitude"] {
            ch.synth.masterVolume = Float(max(0, min(1, amp)) * 5) // Scale up for audibility
        }
        if let pan = mapped["pan"] {
            ch.panner.pan = AUValue(max(-1, min(1, pan)))
        }
    }

    // MARK: - Utilities

    private func dbToLinear(_ db: Double) -> Double {
        db <= -40 ? 0 : pow(10, db / 20)
    }
}
