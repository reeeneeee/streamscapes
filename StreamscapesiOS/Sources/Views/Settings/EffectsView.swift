import SwiftUI

struct EffectsView: View {
    @Environment(AppStore.self) private var store

    private var selectedId: String { store.selectedChannelId ?? store.channelIds.first ?? "" }
    private var config: ChannelConfig? { store.channels[selectedId] }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Channel picker
                channelPicker

                if let config {
                    if config.effects.isEmpty {
                        VStack(spacing: 12) {
                            Text("No effects applied")
                                .font(.custom("DMSans-Regular", size: 13))
                                .foregroundStyle(Theme.textMuted)

                            Text("Add reverb, delay, or filter to shape the sound")
                                .font(.custom("DMSans-Regular", size: 12))
                                .foregroundStyle(Theme.textWhisper)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                    } else {
                        ForEach(Array(config.effects.enumerated()), id: \.offset) { _, effect in
                            effectCard(effect: effect)
                        }
                    }

                    // Add effect buttons
                    HStack(spacing: 8) {
                        addEffectButton("Reverb")
                        addEffectButton("Delay")
                        addEffectButton("Filter")
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

    private func effectCard(effect: Effect) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(effect.type.uppercased())
                    .font(.custom("SpaceGrotesk-Medium", size: 12))
                    .tracking(0.8)
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                Text(effect.bypass ? "OFF" : "ON")
                    .font(.custom("SpaceGrotesk-Regular", size: 10))
                    .foregroundStyle(effect.bypass ? Theme.textWhisper : Theme.accent)
            }

            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("WET")
                        .font(.custom("DMSans-Regular", size: 9))
                        .tracking(1)
                        .foregroundStyle(Theme.textWhisper)
                    Text(String(format: "%.0f%%", effect.wet * 100))
                        .font(.custom("SpaceGrotesk-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                }

                ForEach(Array(effect.params.sorted(by: { $0.key < $1.key })), id: \.key) { key, value in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(key.uppercased())
                            .font(.custom("DMSans-Regular", size: 9))
                            .tracking(1)
                            .foregroundStyle(Theme.textWhisper)
                        Text(String(format: "%.1f", value))
                            .font(.custom("SpaceGrotesk-Regular", size: 12))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func addEffectButton(_ type: String) -> some View {
        Button {
            store.updateChannel(selectedId) { config in
                config.effects.append(
                    Effect(type: type.lowercased(), wet: 0.3, bypass: false, params: [:])
                )
            }
        } label: {
            Text("+ \(type)")
                .font(.custom("DMSans-Medium", size: 12))
                .foregroundStyle(Theme.textMuted)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.03))
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        }
    }
}
