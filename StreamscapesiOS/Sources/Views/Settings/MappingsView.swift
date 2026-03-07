import SwiftUI

struct MappingsView: View {
    @Environment(AppStore.self) private var store

    private var selectedId: String { store.selectedChannelId ?? store.channelIds.first ?? "" }
    private var config: ChannelConfig? { store.channels[selectedId] }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Channel picker (same as Sonification)
                channelPicker

                if let config {
                    if config.mappings.isEmpty {
                        Text("No mappings configured")
                            .font(.custom("DMSans-Regular", size: 13))
                            .foregroundStyle(Theme.textMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    } else {
                        ForEach(Array(config.mappings.enumerated()), id: \.offset) { index, mapping in
                            mappingCard(mapping: mapping, index: index)
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
                Text("Mappings")
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

    private func mappingCard(mapping: SonificationMapping, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Source → Target
            HStack {
                Text(mapping.sourceField)
                    .font(.custom("SpaceGrotesk-Medium", size: 13))
                    .foregroundStyle(Theme.textPrimary)
                Image(systemName: "arrow.right")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.textWhisper)
                Text(mapping.targetParam)
                    .font(.custom("SpaceGrotesk-Medium", size: 13))
                    .foregroundStyle(Theme.accent)
            }

            // Ranges
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("INPUT")
                        .font(.custom("DMSans-Regular", size: 9))
                        .tracking(1)
                        .foregroundStyle(Theme.textWhisper)
                    Text(rangeText(mapping.inputRange))
                        .font(.custom("SpaceGrotesk-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("OUTPUT")
                        .font(.custom("DMSans-Regular", size: 9))
                        .tracking(1)
                        .foregroundStyle(Theme.textWhisper)
                    Text(rangeText(mapping.outputRange))
                        .font(.custom("SpaceGrotesk-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("CURVE")
                        .font(.custom("DMSans-Regular", size: 9))
                        .tracking(1)
                        .foregroundStyle(Theme.textWhisper)
                    Text(mapping.curve.rawValue)
                        .font(.custom("SpaceGrotesk-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
                if mapping.invert {
                    Text("INV")
                        .font(.custom("SpaceGrotesk-Medium", size: 10))
                        .foregroundStyle(Theme.accent.opacity(0.7))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.accent.opacity(0.1))
                        .clipShape(Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func rangeText(_ range: [Double]) -> String {
        guard range.count == 2 else { return "—" }
        return "\(formatNum(range[0]))–\(formatNum(range[1]))"
    }

    private func formatNum(_ n: Double) -> String {
        n == n.rounded() ? String(Int(n)) : String(format: "%.1f", n)
    }
}
