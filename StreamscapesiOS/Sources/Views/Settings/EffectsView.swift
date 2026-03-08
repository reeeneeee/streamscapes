import SwiftUI

struct EffectsView: View {
    @Environment(AppStore.self) private var store

    private let effectTypes = ["reverb", "delay", "chorus", "distortion", "filter", "compressor"]
    private let maxEffects = 4

    private var defaultEffectParams: [String: [String: Double]] {
        [
            "reverb": ["decay": 2.5, "preDelay": 0.01],
            "delay": ["delayTime": 0.25, "feedback": 0.3],
            "chorus": ["frequency": 1.5, "depth": 0.7, "delayTime": 3.5],
            "distortion": ["distortion": 0.4],
            "filter": ["frequency": 1000, "Q": 1],
            "compressor": ["threshold": -24, "ratio": 4],
        ]
    }

    private var selectedId: String { store.selectedChannelId ?? store.channelIds.first ?? "" }
    private var config: ChannelConfig? { store.channels[selectedId] }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                channelPicker

                if let config {
                    HStack {
                        Text("Effects")
                            .font(.custom("SpaceGrotesk-Medium", size: 14))
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                        Text("\(config.effects.count)/\(maxEffects)")
                            .font(.custom("SpaceGrotesk-Regular", size: 11))
                            .foregroundStyle(Theme.textWhisper)
                    }

                    if config.effects.isEmpty {
                        VStack(spacing: 10) {
                            Text("No effects applied")
                                .font(.custom("DMSans-Regular", size: 13))
                                .foregroundStyle(Theme.textMuted)
                            Text("Add reverb, delay, filter, chorus, distortion, or compressor")
                                .font(.custom("DMSans-Regular", size: 11))
                                .foregroundStyle(Theme.textWhisper)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 28)
                        .background(Color.white.opacity(0.02))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        ForEach(Array(config.effects.enumerated()), id: \.offset) { index, effect in
                            effectCard(index: index, effect: effect, total: config.effects.count)
                        }
                    }

                    if config.effects.count < maxEffects {
                        HStack(spacing: 8) {
                            ForEach(effectTypes, id: \.self) { type in
                                Button {
                                    addEffect(type)
                                } label: {
                                    Text("+ \(type)")
                                        .font(.custom("DMSans-Medium", size: 10))
                                        .foregroundStyle(Theme.textMuted)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 7)
                                        .background(Color.white.opacity(0.03))
                                        .clipShape(Capsule())
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Effects")
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

    private func effectCard(index: Int, effect: Effect, total: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(effect.type.uppercased())
                    .font(.custom("SpaceGrotesk-Medium", size: 12))
                    .foregroundStyle(Theme.textSecondary)
                Spacer()

                Button {
                    moveEffect(index: index, delta: -1)
                } label: {
                    Text("▲")
                        .font(.custom("SpaceGrotesk-Regular", size: 10))
                        .foregroundStyle(index == 0 ? Theme.textWhisper : Theme.textMuted)
                }
                .disabled(index == 0)

                Button {
                    moveEffect(index: index, delta: 1)
                } label: {
                    Text("▼")
                        .font(.custom("SpaceGrotesk-Regular", size: 10))
                        .foregroundStyle(index == total - 1 ? Theme.textWhisper : Theme.textMuted)
                }
                .disabled(index == total - 1)

                Button {
                    updateEffect(index: index) { $0.bypass.toggle() }
                } label: {
                    Text(effect.bypass ? "OFF" : "ON")
                        .font(.custom("DMSans-Medium", size: 10))
                        .foregroundStyle(effect.bypass ? Theme.textWhisper : .black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(effect.bypass ? Color.white.opacity(0.06) : Color(hex: 0x4ADE80))
                        .clipShape(Capsule())
                }

                Button {
                    removeEffect(index)
                } label: {
                    Text("✕")
                        .font(.custom("DMSans-Medium", size: 11))
                        .foregroundStyle(.red.opacity(0.9))
                }
            }

            sliderRow("Wet", value: effect.wet, range: 0...1, step: 0.01, suffix: "%") { v in
                updateEffect(index: index) { $0.wet = v }
            }

            ForEach(Array(effect.params.keys.sorted()), id: \.self) { key in
                let value = effect.params[key] ?? 0
                sliderRow(key, value: value, range: paramRange(for: key), step: 0.01) { v in
                    updateEffect(index: index) { eff in
                        eff.params[key] = v
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(effect.bypass ? Color.white.opacity(0.015) : Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .opacity(effect.bypass ? 0.6 : 1)
    }

    private func paramRange(for key: String) -> ClosedRange<Double> {
        switch key {
        case "frequency": return 20...5000
        case "Q": return 0.1...10
        case "ratio": return 1...20
        case "threshold": return -60...0
        default: return 0...10
        }
    }

    private func addEffect(_ type: String) {
        guard let defaults = defaultEffectParams[type] else { return }
        store.updateChannel(selectedId) { cfg in
            guard cfg.effects.count < maxEffects else { return }
            cfg.effects.append(.init(type: type, wet: 0.5, bypass: false, params: defaults))
        }
    }

    private func removeEffect(_ index: Int) {
        store.updateChannel(selectedId) { cfg in
            guard cfg.effects.indices.contains(index) else { return }
            cfg.effects.remove(at: index)
        }
    }

    private func moveEffect(index: Int, delta: Int) {
        store.updateChannel(selectedId) { cfg in
            let next = index + delta
            guard cfg.effects.indices.contains(index), cfg.effects.indices.contains(next) else { return }
            cfg.effects.swapAt(index, next)
        }
    }

    private func updateEffect(index: Int, change: (inout Effect) -> Void) {
        store.updateChannel(selectedId) { cfg in
            guard cfg.effects.indices.contains(index) else { return }
            change(&cfg.effects[index])
        }
    }

    private func sliderRow(_ label: String, value: Double, range: ClosedRange<Double>, step: Double, suffix: String = "", onSet: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textMuted)
                Spacer()
                if suffix == "%" {
                    Text("\(Int((value * 100).rounded()))%")
                        .font(.custom("SpaceGrotesk-Regular", size: 11))
                        .foregroundStyle(Theme.textWhisper)
                } else if value >= 100 || value <= -10 {
                    Text(String(format: "%.0f", value))
                        .font(.custom("SpaceGrotesk-Regular", size: 11))
                        .foregroundStyle(Theme.textWhisper)
                } else {
                    Text(String(format: "%.2f", value))
                        .font(.custom("SpaceGrotesk-Regular", size: 11))
                        .foregroundStyle(Theme.textWhisper)
                }
            }
            Slider(value: Binding(get: { value }, set: onSet), in: range, step: step)
                .tint(Theme.accent.opacity(0.75))
        }
    }
}
