import SwiftUI

private let vuSegCount = 6

struct TransportBarView: View {
    @Environment(AppStore.self) private var store
    @Environment(AudioCoordinator.self) private var coordinator

    var body: some View {
        HStack(spacing: 12) {
            // Stream VU meters
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(store.channelIds, id: \.self) { id in
                    if let config = store.channels[id], config.enabled {
                        VuColumn(
                            color: Theme.streamColor(for: id),
                            level: coordinator.channelLevels[id] ?? 0,
                            state: store.activeStreams[id]
                        )
                    }
                }
            }

            Spacer()

            // Master volume
            HStack(spacing: 6) {
                Text("Vol")
                    .font(.custom("DMSans-Regular", size: 11))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize()

                FaderSlider(
                    value: Binding(
                        get: { store.global.masterVolume },
                        set: { val in store.updateGlobal { $0.masterVolume = val } }
                    ),
                    range: -40...6,
                    thumbColor: Color.white.opacity(0.7)
                )

                Text(store.global.masterVolume > -40 ? String(format: "%.0f", store.global.masterVolume) : "-∞")
                    .font(.custom("SpaceGrotesk-Regular", size: 10))
                    .foregroundStyle(Theme.textMuted)
                    .frame(width: 28, alignment: .trailing)
                    .fixedSize()
            }
            .frame(maxWidth: .infinity)
            .frame(maxWidth: 200)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(hex: 0x0D0D0D).opacity(0.95))
    }
}

/// Mini vertical dotted VU column — matches web TransportBar VuDots
private struct VuColumn: View {
    let color: Color
    let level: Double
    let state: AppStore.StreamState?

    var body: some View {
        let litSegs = Int((min(max(level, 0), 1) * Double(vuSegCount)).rounded())
        VStack(spacing: 2) {
            ForEach((0..<vuSegCount).reversed(), id: \.self) { i in
                let isLit = i < litSegs
                Circle()
                    .fill(state == nil ? Color(white: 0.2) : (isLit ? color : color))
                    .frame(width: 4, height: 4)
                    .opacity(isLit
                        ? 0.5 + (Double(i) / Double(vuSegCount)) * 0.5
                        : (state != nil ? 0.15 : 0.1))
            }
        }
        .frame(width: 6, height: 38)
    }
}
