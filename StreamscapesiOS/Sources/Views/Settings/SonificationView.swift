import SwiftUI

struct SonificationView: View {
    @Environment(AppStore.self) private var store

    private var selectedId: String { store.selectedChannelId ?? store.channelIds.first ?? "" }
    private var config: ChannelConfig? { store.channels[selectedId] }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Channel picker
                channelPicker

                if let config {
                    // Synth type
                    settingsSection(title: "SYNTH TYPE") {
                        HStack(spacing: 8) {
                            synthChip("sine", current: config.synthType)
                            synthChip("triangle", current: config.synthType)
                            synthChip("square", current: config.synthType)
                            synthChip("sawtooth", current: config.synthType)
                        }
                    }

                    // Behavior
                    settingsSection(title: "BEHAVIOR") {
                        HStack(spacing: 8) {
                            behaviorChip(.ambient, current: config.behaviorType)
                            behaviorChip(.event, current: config.behaviorType)
                            behaviorChip(.hybrid, current: config.behaviorType)
                        }
                    }

                    // Mode (for ambient)
                    if config.behaviorType == .ambient {
                        settingsSection(title: "AMBIENT MODE") {
                            HStack(spacing: 8) {
                                modeChip(.arpeggio, current: config.ambientMode)
                                modeChip(.sustain, current: config.ambientMode)
                                modeChip(.drone, current: config.ambientMode)
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

    private func synthChip(_ type: String, current: String) -> some View {
        Button {
            store.updateChannel(selectedId) { $0.synthType = type }
        } label: {
            Text(type)
                .font(.custom("SpaceGrotesk-Regular", size: 12))
                .foregroundStyle(current == type ? Theme.textPrimary : Theme.textMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(current == type ? Color.white.opacity(0.08) : Color.white.opacity(0.02))
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(current == type ? Color.white.opacity(0.12) : Color.clear, lineWidth: 1)
                )
        }
    }

    private func behaviorChip(_ type: ChannelConfig.BehaviorType, current: ChannelConfig.BehaviorType) -> some View {
        Button {
            store.updateChannel(selectedId) { $0.behaviorType = type }
        } label: {
            Text(type.rawValue)
                .font(.custom("SpaceGrotesk-Regular", size: 12))
                .foregroundStyle(current == type ? Theme.textPrimary : Theme.textMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(current == type ? Color.white.opacity(0.08) : Color.white.opacity(0.02))
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(current == type ? Color.white.opacity(0.12) : Color.clear, lineWidth: 1)
                )
        }
    }

    private func modeChip(_ mode: ChannelConfig.AmbientMode, current: ChannelConfig.AmbientMode) -> some View {
        Button {
            store.updateChannel(selectedId) { $0.ambientMode = mode }
        } label: {
            Text(mode.rawValue)
                .font(.custom("SpaceGrotesk-Regular", size: 12))
                .foregroundStyle(current == mode ? Theme.textPrimary : Theme.textMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(current == mode ? Color.white.opacity(0.08) : Color.white.opacity(0.02))
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(current == mode ? Color.white.opacity(0.12) : Color.clear, lineWidth: 1)
                )
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
