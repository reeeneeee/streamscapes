import SwiftUI

struct MixerView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(spacing: 2) {
            // Channel rows
            ForEach(store.channelIds, id: \.self) { id in
                if let config = store.channels[id] {
                    ChannelRow(id: id, config: config)
                }
            }

            // Master
            masterRow
                .padding(.top, 8)

            // Meta
            metaRow
                .padding(.top, 4)
        }
        .padding(.horizontal, 16)
    }

    private var masterRow: some View {
        HStack(spacing: 12) {
            Text("MASTER")
                .font(.custom("SpaceGrotesk-Medium", size: 11))
                .tracking(1)
                .foregroundStyle(Theme.textMuted)
                .frame(width: 56, alignment: .leading)

            Slider(
                value: Binding(
                    get: { store.global.masterVolume },
                    set: { val in store.updateGlobal { $0.masterVolume = val } }
                ),
                in: -40...6,
                step: 0.5
            )
            .tint(Theme.textMuted)

            Text(store.global.masterVolume > -40 ? String(format: "%.1f", store.global.masterVolume) : "-∞")
                .font(.custom("SpaceGrotesk-Regular", size: 12))
                .foregroundStyle(Theme.textSecondary)
                .frame(width: 40, alignment: .trailing)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
    }

    private var metaRow: some View {
        HStack(spacing: 16) {
            HStack(spacing: 6) {
                Text("BPM")
                    .font(.custom("DMSans-Regular", size: 11))
                    .tracking(0.8)
                    .foregroundStyle(Theme.textWhisper)
                Text("\(store.global.tempo)")
                    .font(.custom("SpaceGrotesk-Regular", size: 13))
                    .foregroundStyle(Theme.textSecondary)
            }

            Rectangle()
                .fill(Theme.border)
                .frame(width: 1, height: 12)

            HStack(spacing: 6) {
                Text("KEY")
                    .font(.custom("DMSans-Regular", size: 11))
                    .tracking(0.8)
                    .foregroundStyle(Theme.textWhisper)
                Text("\(store.global.rootNote) \(store.global.scale)")
                    .font(.custom("SpaceGrotesk-Regular", size: 13))
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Text("\(store.activeCount) active")
                .font(.custom("DMSans-Regular", size: 11))
                .tracking(0.8)
                .foregroundStyle(Theme.textWhisper)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }
}

// MARK: - Channel Row

struct ChannelRow: View {
    @Environment(AppStore.self) private var store
    let id: String
    let config: ChannelConfig

    private var dimmed: Bool { !config.enabled || config.mute }

    var body: some View {
        HStack(spacing: 12) {
            // Accent dot
            Circle()
                .fill(Theme.streamColor(for: id))
                .frame(width: 6, height: 6)

            // Name
            Text(Theme.streamLabel(for: id))
                .font(.custom("DMSans-Medium", size: 14))
                .foregroundStyle(Theme.textPrimary)
                .frame(width: 68, alignment: .leading)

            // Volume slider
            Slider(
                value: Binding(
                    get: { config.volume },
                    set: { val in store.updateChannel(id) { $0.volume = val } }
                ),
                in: -30...6,
                step: 0.5
            )
            .tint(Color.white.opacity(0.25))

            // dB readout
            Text(String(format: "%.1f", config.volume))
                .font(.custom("SpaceGrotesk-Regular", size: 11))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 40, alignment: .trailing)

            // S / M buttons
            HStack(spacing: 4) {
                soloButton
                muteButton
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .opacity(dimmed ? 0.4 : 1)
    }

    private var soloButton: some View {
        Button {
            if config.solo {
                store.updateChannel(id) { $0.solo = false }
            } else {
                store.updateChannel(id) { c in
                    c.enabled = true
                    c.solo = true
                    c.mute = false
                }
            }
        } label: {
            Text("S")
                .font(.custom("SpaceGrotesk-SemiBold", size: 11))
                .foregroundStyle(config.solo ? Color(hex: 0xFACC15).opacity(0.9) : Theme.textWhisper)
                .frame(width: 28, height: 28)
                .background(config.solo ? Color(hex: 0xFACC15).opacity(0.15) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(config.solo ? Color(hex: 0xFACC15).opacity(0.3) : Color.white.opacity(0.06), lineWidth: 1)
                )
        }
    }

    private var muteButton: some View {
        Button {
            if !config.enabled {
                store.updateChannel(id) { c in
                    c.enabled = true
                    c.mute = false
                }
            } else {
                store.updateChannel(id) { $0.mute = !$0.mute }
            }
        } label: {
            Text("M")
                .font(.custom("SpaceGrotesk-SemiBold", size: 11))
                .foregroundStyle(config.mute ? Color.red.opacity(0.8) : Theme.textWhisper)
                .frame(width: 28, height: 28)
                .background(config.mute ? Color.red.opacity(0.15) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(config.mute ? Color.red.opacity(0.25) : Color.white.opacity(0.06), lineWidth: 1)
                )
        }
    }
}
