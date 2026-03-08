import SwiftUI

struct SonificationView: View {
    @Environment(AppStore.self) private var store

    private let synthTypes = ["Synth", "FMSynth", "AMSynth", "PluckSynth", "MembraneSynth", "NoiseSynth"]
    private let sampleSources = ["rain", "wind", "vinyl", "chimes"]
    private let envelopeSupportedSynths = ["Synth", "FMSynth", "AMSynth", "MembraneSynth"]

    private let streamRecommendations: [String: (behavior: ChannelConfig.BehaviorType, ambient: ChannelConfig.AmbientMode?, synth: String, mode: String, hint: String)] = [
        "weather": (.ambient, .sustain, "AMSynth", "continuous", "Weather changes slowly; sustain is usually easiest to read."),
        "flights": (.ambient, .sustain, "FMSynth", "continuous", "Dense stream; sustain keeps cognitive load low."),
        "wikipedia": (.event, nil, "Synth", "triggered", "Discrete events are best heard as individual notes."),
        "rss": (.event, nil, "PluckSynth", "triggered", "News arrivals are event-like; plucks make each item clear."),
        "stocks": (.event, nil, "MembraneSynth", "triggered", "Ticks are event-like; cooldown helps avoid over-triggering."),
    ]

    private var selectedId: String { store.selectedChannelId ?? store.channelIds.first ?? "" }
    private var config: ChannelConfig? { store.channels[selectedId] }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                channelPicker

                if let config {
                    if let rec = streamRecommendations[selectedId] {
                        settingsSection(title: "RECOMMENDED PRESET") {
                            Text(rec.hint)
                                .font(.custom("DMSans-Regular", size: 11))
                                .foregroundStyle(Theme.textMuted)
                            Button {
                                store.updateChannel(selectedId) { cfg in
                                    cfg.behaviorType = rec.behavior
                                    if let ambient = rec.ambient { cfg.ambientMode = ambient }
                                    cfg.synthType = rec.synth
                                    cfg.mode = rec.mode
                                }
                            } label: {
                                Text("Apply Recommended Preset")
                                    .font(.custom("DMSans-Medium", size: 11))
                                    .foregroundStyle(.black)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(Color(hex: 0x4ADE80))
                                    .clipShape(Capsule())
                            }
                        }
                    }

                    settingsSection(title: "SYNTH TYPE") {
                        wrappingChips(synthTypes, current: config.synthType) { v in
                            store.updateChannel(selectedId) { $0.synthType = v }
                        }
                    }

                    settingsSection(title: "BEHAVIOR TYPE") {
                        HStack(spacing: 8) {
                            behaviorChip(.ambient, current: config.behaviorType)
                            behaviorChip(.event, current: config.behaviorType)
                            behaviorChip(.hybrid, current: config.behaviorType)
                        }
                    }

                    if config.behaviorType != .event {
                        settingsSection(title: "AMBIENT MODE") {
                            HStack(spacing: 8) {
                                modeChip(.arpeggio, current: config.ambientMode)
                                modeChip(.sustain, current: config.ambientMode)
                                modeChip(.sample, current: config.ambientMode)
                            }
                            sliderRow("Smoothing (ms)", value: config.smoothingMs ?? 1200, range: 100...5000, step: 50) { v in
                                store.updateChannel(selectedId) { $0.smoothingMs = v }
                            }
                        }
                    }

                    if config.ambientMode == .sample {
                        settingsSection(title: "SAMPLE ENGINE") {
                            wrappingChips(sampleSources, current: config.sampleSource ?? "rain") { v in
                                store.updateChannel(selectedId) { $0.sampleSource = v }
                            }
                            sliderRow("Rate Min", value: config.samplePlaybackRateMin ?? 0.8, range: 0.25...2.0, step: 0.01) { v in
                                store.updateChannel(selectedId) { $0.samplePlaybackRateMin = v }
                            }
                            sliderRow("Rate Max", value: config.samplePlaybackRateMax ?? 1.2, range: 0.25...2.5, step: 0.01) { v in
                                store.updateChannel(selectedId) { $0.samplePlaybackRateMax = v }
                            }
                            sliderRow("Density (Hz)", value: config.sampleDensity ?? 1.2, range: 0.2...8.0, step: 0.1) { v in
                                store.updateChannel(selectedId) { $0.sampleDensity = v }
                            }
                            sliderRow("Filter (Hz)", value: config.sampleFilterCutoff ?? 2200, range: 200...10000, step: 50) { v in
                                store.updateChannel(selectedId) { $0.sampleFilterCutoff = v }
                            }
                            sliderRow("Reverb Send", value: config.sampleReverbSend ?? 0.25, range: 0...1, step: 0.01) { v in
                                store.updateChannel(selectedId) { $0.sampleReverbSend = v }
                            }
                        }
                    }

                    if config.behaviorType != .ambient {
                        settingsSection(title: "EVENT SHAPING") {
                            sliderRow("Cooldown (ms)", value: config.eventCooldownMs ?? 150, range: 0...1500, step: 25) { v in
                                store.updateChannel(selectedId) { $0.eventCooldownMs = v }
                            }
                            sliderRow("Trigger Threshold", value: config.eventTriggerThreshold ?? 0, range: 0...1, step: 0.01) { v in
                                store.updateChannel(selectedId) { $0.eventTriggerThreshold = v }
                            }
                            sliderRow("Burst Cap", value: Double(config.eventBurstCap ?? 0), range: 0...12, step: 1) { v in
                                store.updateChannel(selectedId) { $0.eventBurstCap = Int(v) }
                            }
                            sliderRow("Burst Window (ms)", value: config.eventBurstWindowMs ?? 1200, range: 200...5000, step: 50) { v in
                                store.updateChannel(selectedId) { $0.eventBurstWindowMs = v }
                            }
                            HStack(spacing: 8) {
                                articulationChip(.soft, current: config.eventArticulation ?? .neutral)
                                articulationChip(.neutral, current: config.eventArticulation ?? .neutral)
                                articulationChip(.punchy, current: config.eventArticulation ?? .neutral)
                            }
                            if config.behaviorType == .hybrid {
                                sliderRow("Hybrid Accent", value: config.hybridAccent ?? 0.6, range: 0...1, step: 0.01) { v in
                                    store.updateChannel(selectedId) { $0.hybridAccent = v }
                                }
                            }
                        }
                    }

                    settingsSection(title: "MONITORING") {
                        HStack(spacing: 8) {
                            alertChip(.advisory, current: config.alertTier ?? .advisory)
                            alertChip(.abnormal, current: config.alertTier ?? .advisory)
                            alertChip(.critical, current: config.alertTier ?? .advisory)
                        }
                        sliderRow("Beacon Threshold", value: config.beaconThreshold ?? 0, range: 0...1, step: 0.01) { v in
                            store.updateChannel(selectedId) { $0.beaconThreshold = v }
                        }
                        sliderRow("Periodic Beacon (s)", value: config.beaconPeriodicSec ?? 0, range: 0...60, step: 1) { v in
                            store.updateChannel(selectedId) { $0.beaconPeriodicSec = v }
                        }
                        Toggle("Beacon On Extrema", isOn: Binding(
                            get: { config.beaconOnExtrema ?? false },
                            set: { newValue in store.updateChannel(selectedId) { $0.beaconOnExtrema = newValue } }
                        ))
                        .tint(Theme.accent)
                    }

                    settingsSection(title: "ENVELOPE (ADSR)") {
                        if !envelopeSupportedSynths.contains(config.synthType) {
                            Text("Not available for \(config.synthType)")
                                .font(.custom("DMSans-Regular", size: 11))
                                .foregroundStyle(Theme.textWhisper)
                        }
                        sliderRow("Attack", value: config.synthOptions.envelope?.attack ?? 0.01, range: 0.001...2, step: 0.01) { v in
                            store.updateChannel(selectedId) { c in
                                let env = c.synthOptions.envelope ?? .init(attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3)
                                c.synthOptions.envelope = .init(attack: v, decay: env.decay, sustain: env.sustain, release: env.release)
                            }
                        }
                        sliderRow("Decay", value: config.synthOptions.envelope?.decay ?? 0.2, range: 0.01...2, step: 0.01) { v in
                            store.updateChannel(selectedId) { c in
                                let env = c.synthOptions.envelope ?? .init(attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3)
                                c.synthOptions.envelope = .init(attack: env.attack, decay: v, sustain: env.sustain, release: env.release)
                            }
                        }
                        sliderRow("Sustain", value: config.synthOptions.envelope?.sustain ?? 0.5, range: 0...1, step: 0.01) { v in
                            store.updateChannel(selectedId) { c in
                                let env = c.synthOptions.envelope ?? .init(attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3)
                                c.synthOptions.envelope = .init(attack: env.attack, decay: env.decay, sustain: v, release: env.release)
                            }
                        }
                        sliderRow("Release", value: config.synthOptions.envelope?.release ?? 0.3, range: 0.01...5, step: 0.01) { v in
                            store.updateChannel(selectedId) { c in
                                let env = c.synthOptions.envelope ?? .init(attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3)
                                c.synthOptions.envelope = .init(attack: env.attack, decay: env.decay, sustain: env.sustain, release: v)
                            }
                        }
                    }
                    .opacity(envelopeSupportedSynths.contains(config.synthType) ? 1 : 0.45)
                    .disabled(!envelopeSupportedSynths.contains(config.synthType))
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Sonification")
                    .font(.custom("SpaceGrotesk-Medium", size: 15))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .toolbarBackground(Theme.bgPrimary, for: .navigationBar)
    }

    private var channelPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.channelIds, id: \.self) { id in
                    Button {
                        store.selectedChannelId = id
                    } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Theme.streamColor(for: id))
                                .frame(width: 6, height: 6)
                            Text(Theme.streamLabel(for: id))
                                .font(.custom("DMSans-Medium", size: 13))
                                .foregroundStyle(selectedId == id ? Theme.textPrimary : Theme.textMuted)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(selectedId == id ? Color.white.opacity(0.06) : Color.white.opacity(0.02))
                        .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func wrappingChips(_ values: [String], current: String, set: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(stride(from: 0, to: values.count, by: 3).map { $0 }, id: \.self) { i in
                HStack(spacing: 8) {
                    ForEach(values[i..<min(i + 3, values.count)], id: \.self) { value in
                        Button {
                            set(value)
                        } label: {
                            Text(value)
                                .font(.custom("SpaceGrotesk-Regular", size: 11))
                                .foregroundStyle(current == value ? Theme.textPrimary : Theme.textMuted)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(current == value ? Color.white.opacity(0.08) : Color.white.opacity(0.02))
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(current == value ? Color.white.opacity(0.12) : Color.clear, lineWidth: 1))
                        }
                    }
                    Spacer()
                }
            }
        }
    }

    private func behaviorChip(_ type: ChannelConfig.BehaviorType, current: ChannelConfig.BehaviorType) -> some View {
        chip(type.rawValue, current: current.rawValue == type.rawValue) {
            store.updateChannel(selectedId) { cfg in
                cfg.behaviorType = type
                if type == .ambient {
                    let ambient = cfg.ambientMode
                    cfg.mode = ambient == .sustain ? "continuous" : "pattern"
                    cfg.smoothingMs = cfg.smoothingMs ?? 1200
                } else if type == .event {
                    cfg.mode = "triggered"
                    cfg.eventCooldownMs = cfg.eventCooldownMs ?? 150
                    cfg.eventTriggerThreshold = cfg.eventTriggerThreshold ?? 0
                    cfg.eventBurstCap = cfg.eventBurstCap ?? 0
                    cfg.eventBurstWindowMs = cfg.eventBurstWindowMs ?? 1200
                    cfg.eventArticulation = cfg.eventArticulation ?? .neutral
                } else {
                    cfg.mode = "pattern"
                    cfg.smoothingMs = cfg.smoothingMs ?? 800
                    cfg.eventCooldownMs = cfg.eventCooldownMs ?? 180
                    cfg.eventTriggerThreshold = cfg.eventTriggerThreshold ?? 0
                    cfg.eventBurstCap = cfg.eventBurstCap ?? 0
                    cfg.eventBurstWindowMs = cfg.eventBurstWindowMs ?? 1200
                    cfg.eventArticulation = cfg.eventArticulation ?? .neutral
                    cfg.hybridAccent = cfg.hybridAccent ?? 0.6
                }
            }
        }
    }

    private func modeChip(_ mode: ChannelConfig.AmbientMode, current: ChannelConfig.AmbientMode) -> some View {
        chip(mode.rawValue, current: current.rawValue == mode.rawValue) {
            store.updateChannel(selectedId) { cfg in
                cfg.ambientMode = mode
                cfg.mode = mode == .sustain ? "continuous" : "pattern"
            }
        }
    }

    private func articulationChip(_ art: ChannelConfig.Articulation, current: ChannelConfig.Articulation) -> some View {
        chip(art.rawValue, current: current.rawValue == art.rawValue) {
            store.updateChannel(selectedId) { $0.eventArticulation = art }
        }
    }

    private func alertChip(_ tier: ChannelConfig.AlertTier, current: ChannelConfig.AlertTier) -> some View {
        chip(tier.rawValue, current: current.rawValue == tier.rawValue) {
            store.updateChannel(selectedId) { $0.alertTier = tier }
        }
    }

    private func chip(_ label: String, current: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.custom("SpaceGrotesk-Regular", size: 12))
                .foregroundStyle(current ? Theme.textPrimary : Theme.textMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(current ? Color.white.opacity(0.08) : Color.white.opacity(0.02))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(current ? Color.white.opacity(0.12) : Color.clear, lineWidth: 1))
        }
    }

    private func sliderRow(_ label: String, value: Double, range: ClosedRange<Double>, step: Double, onSet: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textMuted)
                Spacer()
                Text(String(format: label.contains("Threshold") || label.contains("Send") || label.contains("Rate") || label.contains("Accent") ? "%.2f" : "%.0f", value))
                    .font(.custom("SpaceGrotesk-Regular", size: 11))
                    .foregroundStyle(Theme.textWhisper)
            }
            Slider(value: Binding(get: { value }, set: onSet), in: range, step: step)
                .tint(Theme.accent.opacity(0.75))
        }
    }

    private func settingsSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.custom("DMSans-Regular", size: 10))
                .tracking(1.2)
                .foregroundStyle(Theme.textWhisper)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
