import SwiftUI

struct SonificationStreamList: View {
    @Environment(AppStore.self) private var store

    private let hiddenParents: Set<String> = ["weather", "otlp"]

    private var visibleIds: [String] {
        store.channelIds.filter { !hiddenParents.contains($0) }
    }

    private var continuousIds: [String] {
        visibleIds.filter { id in
            let ch = store.channels[id]
            return ch?.behaviorType == .ambient || ch?.behaviorType == .hybrid
        }
    }

    private var discreteIds: [String] {
        visibleIds.filter { id in
            let ch = store.channels[id]
            return ch?.behaviorType != .ambient && ch?.behaviorType != .hybrid
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Continuous section
            if !continuousIds.isEmpty {
                sectionHeader("Continuous")
                VStack(spacing: 2) {
                    ForEach(continuousIds, id: \.self) { id in
                        StreamRow(id: id)
                    }
                }
            }

            // Discrete section
            if !discreteIds.isEmpty {
                sectionHeader("Discrete")
                    .padding(.top, 4)
                VStack(spacing: 2) {
                    ForEach(discreteIds, id: \.self) { id in
                        StreamRow(id: id)
                    }
                }
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.custom("DMSans-Regular", size: 9))
            .tracking(1.2)
            .foregroundStyle(Theme.textWhisper)
            .padding(.leading, 4)
    }
}

// MARK: - Stream Row

private struct StreamRow: View {
    @Environment(AppStore.self) private var store
    let id: String

    private var config: ChannelConfig? { store.channels[id] }
    private var isSelected: Bool { store.selectedChannelId == id }
    private var isContinuous: Bool {
        config?.behaviorType == .ambient || config?.behaviorType == .hybrid
    }
    private var isPattern: Bool {
        config?.mode == "pattern"
    }

    var body: some View {
        if let ch = config {
            HStack(spacing: 8) {
                // Color dot
                Circle()
                    .fill(Theme.streamColor(for: id))
                    .frame(width: 6, height: 6)

                // Label
                Text(Theme.streamLabel(for: id))
                    .font(.custom("DMSans-Medium", size: 12))
                    .foregroundStyle(isSelected ? Theme.textPrimary : Theme.textMuted)
                    .frame(minWidth: 70, alignment: .leading)

                // Arp / Steady toggle for continuous streams
                if isContinuous {
                    ambientModeToggle(ch: ch)
                }

                // Arp shape picker for pattern-mode streams
                if isPattern {
                    arpShapePicker(ch: ch)
                }

                Spacer()

                // Intent preset picker
                presetPicker(ch: ch)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .background(isSelected ? Color.white.opacity(0.06) : .clear)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .contentShape(Rectangle())
            .onTapGesture {
                store.selectedChannelId = id
            }
        }
    }

    @ViewBuilder
    private func ambientModeToggle(ch: ChannelConfig) -> some View {
        let currentMode = ch.ambientMode
        HStack(spacing: 0) {
            modeButton("arp", mode: .arpeggio, current: currentMode)
            modeButton("steady", mode: .sustain, current: currentMode)
        }
        .background(Theme.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func modeButton(_ label: String, mode: ChannelConfig.AmbientMode, current: ChannelConfig.AmbientMode) -> some View {
        Button {
            let modeMap: [ChannelConfig.AmbientMode: String] = [.arpeggio: "pattern", .sustain: "continuous"]
            store.updateChannel(id) { c in
                c.ambientMode = mode
                c.mode = modeMap[mode] ?? "pattern"
            }
            store.selectedChannelId = id
        } label: {
            Text(label)
                .font(.custom("DMSans-Regular", size: 9))
                .foregroundStyle(current == mode ? Theme.textPrimary : Theme.textWhisper)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(current == mode ? Color.white.opacity(0.12) : .clear)
        }
    }

    @ViewBuilder
    private func arpShapePicker(ch: ChannelConfig) -> some View {
        let current = ch.patternType ?? "walk"
        let currentShape = ARP_SHAPES.first { $0.id == current } ?? ARP_SHAPES.first { $0.id == "walk" }!
        Menu {
            ForEach(ARP_SHAPES) { shape in
                Button {
                    store.updateChannel(id) { $0.patternType = shape.id }
                } label: {
                    HStack {
                        Text(shape.label)
                        if current == shape.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            ArpSparkline(degrees: currentShape.degrees, color: Theme.streamColor(for: id))
                .frame(width: 28, height: 14)
                .padding(.horizontal, 4)
                .padding(.vertical, 3)
                .background(Color.white.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private func presetPicker(ch: ChannelConfig) -> some View {
        let currentIntent = ch.intent

        Menu {
            ForEach(ALL_INTENTS.filter { ($0.mode == "continuous") == (ch.mode == "continuous") }) { intent in
                Button {
                    store.updateChannel(id) { c in
                        intent.apply(to: &c)
                    }
                } label: {
                    HStack {
                        Text(intent.name)
                        if currentIntent == intent.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(currentIntent.flatMap { id in ALL_INTENTS.first { $0.id == id }?.name } ?? "Preset")
                    .font(.custom("DMSans-Regular", size: 9))
                    .foregroundStyle(currentIntent != nil ? Theme.textPrimary : Theme.textWhisper)
                Image(systemName: "chevron.down")
                    .font(.system(size: 7, weight: .medium))
                    .foregroundStyle(Theme.textWhisper)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                currentIntent != nil
                    ? Theme.streamColor(for: id).opacity(isSelected ? 0.3 : 0.15)
                    : Color.white.opacity(0.04)
            )
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
    }
}

// MARK: - Arp Sparkline

/// Mini polyline chart of arp shape degrees, matching web's ShapeSVG
private struct ArpSparkline: View {
    let degrees: [Int]
    var color: Color = .white.opacity(0.4)

    var body: some View {
        GeometryReader { geo in
            let pad: CGFloat = 2
            let w = geo.size.width - pad * 2
            let h = geo.size.height - pad * 2
            let maxDeg = CGFloat(degrees.max() ?? 1)

            Path { path in
                for (i, deg) in degrees.enumerated() {
                    let x = pad + (CGFloat(i) / CGFloat(max(degrees.count - 1, 1))) * w
                    let y = pad + (1 - CGFloat(deg) / max(maxDeg, 1)) * h
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                    else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }
    }
}
