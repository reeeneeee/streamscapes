import SwiftUI

struct MixerView: View {
    @Environment(AppStore.self) private var store
    @Environment(AudioCoordinator.self) private var coordinator

    private let publicStreamIds: Set<String> = ["weather:temp", "weather:clouds", "flights", "wikipedia", "archive", "rss", "stocks"]
    private let hiddenParents: Set<String> = ["weather", "otlp"]

    private var publicIds: [String] {
        store.channelIds.filter { publicStreamIds.contains($0) }
    }

    private var privateIds: [String] {
        store.channelIds.filter { !publicStreamIds.contains($0) && !hiddenParents.contains($0) }
    }

    /// Group private IDs by source prefix (dd, otlp, notify, github, chrome)
    private var sourceGroups: [(prefix: String, ids: [String])] {
        var groups: [String: [String]] = [:]
        for id in privateIds {
            let prefix = id.split(separator: ":").first.map(String.init) ?? id
            groups[prefix, default: []].append(id)
        }
        // Sort [all] to the top within each group, then alphabetical
        return groups.sorted(by: { $0.key < $1.key }).map { entry in
            let sorted = entry.value.sorted { a, b in
                let aAll = a.hasSuffix(":[all]")
                let bAll = b.hasSuffix(":[all]")
                if aAll != bAll { return aAll }
                return a < b
            }
            return (prefix: entry.key, ids: sorted)
        }
    }

    var body: some View {
        VStack(spacing: 2) {
            ForEach(publicIds, id: \.self) { id in
                if let config = store.channels[id] {
                    ChannelRow(id: id, config: config, level: coordinator.channelLevels[id] ?? 0)
                    if id == "stocks" { StockSymbolsInline() }
                    if id == "rss" { RssFeedsInline() }
                }
            }

            // Section: Private
            sectionLabel("Private")
                .padding(.top, 8)

            ForEach(sourceGroups, id: \.prefix) { group in
                SourceGroupRow(prefix: group.prefix, ids: group.ids, levels: coordinator.channelLevels)
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

    private func sectionLabel(_ text: String) -> some View {
        HStack {
            Text(text.uppercased())
                .font(.custom("SpaceGrotesk-Medium", size: 10))
                .tracking(1.5)
                .foregroundStyle(Theme.textWhisper)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
    }

    private var masterRow: some View {
        HStack(spacing: 12) {
            Text("MASTER")
                .font(.custom("SpaceGrotesk-Medium", size: 11))
                .tracking(1)
                .foregroundStyle(Theme.textMuted)
                .frame(width: 56, alignment: .leading)

            FaderSlider(
                value: Binding(
                    get: { store.global.masterVolume },
                    set: { val in store.updateGlobal { $0.masterVolume = val } }
                ),
                range: -40...6
            )

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
    @Environment(AudioCoordinator.self) private var coordinator
    let id: String
    let config: ChannelConfig
    var level: Double = 0

    private var isOn: Bool { config.enabled && !config.mute }
    private var dimmed: Bool { !isOn || config.soundEnabled == false }
    private var hasVisual: Bool { id == "flights" || id == "wikipedia" || id == "archive" }
    private var isVisualOff: Bool { config.visualEnabled == false }
    private var isSubChannel: Bool {
        ["otlp:", "dd:", "notify:", "github:", "chrome:", "system:", "watch:"].contains(where: { id.hasPrefix($0) })
    }

    var body: some View {
        HStack(spacing: 10) {
            // On/off toggle (matches web pill switch)
            Button {
                if isOn {
                    store.updateChannel(id) { $0.enabled = false; $0.solo = false }
                } else {
                    store.updateChannel(id) { $0.enabled = true; $0.mute = false }
                }
            } label: {
                Capsule()
                    .fill(isOn ? Theme.streamColor(for: id) : Color.white.opacity(0.08))
                    .frame(width: 32, height: 18)
                    .overlay(
                        Circle()
                            .fill(.white)
                            .frame(width: 14, height: 14)
                            .shadow(color: .black.opacity(0.3), radius: 1.5, y: 1)
                            .offset(x: isOn ? 7 : -7),
                        alignment: .center
                    )
                    .animation(.easeInOut(duration: 0.15), value: isOn)
            }
            .buttonStyle(.plain)

            // Accent dot
            Circle()
                .fill(Theme.streamColor(for: id))
                .frame(width: 5, height: 5)

            // Name + intent/mode + metric
            VStack(alignment: .leading, spacing: 2) {
                Text(Theme.streamLabel(for: id))
                    .font(.custom("DMSans-Medium", size: 14))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Text("\(config.intent ?? config.synthType) · \(config.mode)")
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textWhisper)
                    .lineLimit(1)
                if let metric = coordinator.metricValues[id] {
                    Text(metric)
                        .font(.custom("DMSans-Regular", size: 10))
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(minWidth: 60, maxWidth: 120, alignment: .leading)

            // Volume fader with VU level fill
            FaderSlider(
                value: Binding(
                    get: { config.volume },
                    set: { val in store.updateChannel(id) { $0.volume = val } }
                ),
                range: -30...6,
                levelFill: level,
                levelColor: Theme.streamColor(for: id)
            )

            // dB readout
            Text(String(format: "%.1f", config.volume))
                .font(.custom("SpaceGrotesk-Regular", size: 11))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 40, alignment: .trailing)

            // Eye toggle (flights/wikipedia only) — matches web per-channel visual toggle
            if hasVisual {
                Button {
                    store.updateChannel(id) { $0.visualEnabled = isVisualOff ? nil : false }
                } label: {
                    Text("\u{1F441}")
                        .font(.system(size: 12))
                        .frame(width: 24, height: 24)
                        .background(isVisualOff ? .clear : Color.white.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(isVisualOff ? Color.white.opacity(0.06) : Color.white.opacity(0.1), lineWidth: 1)
                        )
                        .opacity(isVisualOff ? 0.3 : 1)
                }
            }

            // Dismiss button for sub-channels
            if isSubChannel {
                Button {
                    store.removeChannel(id)
                } label: {
                    Text("\u{00D7}")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.white.opacity(0.15))
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .opacity(dimmed ? 0.4 : 1)
    }
}

// MARK: - Source Group Row

private let sourceLabels: [String: String] = [
    "dd": "Datadog",
    "otlp": "OTLP",
    "notify": "Notifications",
    "github": "GitHub",
    "chrome": "Chrome Extension",
    "system": "System",
    "watch": "Apple Watch",
]

struct SourceGroupRow: View {
    @Environment(AppStore.self) private var store
    let prefix: String
    let ids: [String]
    var levels: [String: Double] = [:]
    @State private var collapsed = false

    private var label: String { sourceLabels[prefix] ?? prefix }
    private var color: Color { Theme.streamColor(for: ids.first ?? "\(prefix):unknown") }
    private var allSoundOff: Bool { ids.allSatisfy { store.channels[$0]?.soundEnabled == false } }
    private var allVisualOff: Bool { ids.allSatisfy { store.channels[$0]?.visualEnabled == false } }

    var body: some View {
        VStack(spacing: 0) {
            // Source header — tap to collapse/expand
            HStack(spacing: 8) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundStyle(Theme.textWhisper)
                    .rotationEffect(.degrees(collapsed ? 0 : 90))
                    .animation(.easeInOut(duration: 0.15), value: collapsed)
                Circle()
                    .fill(color)
                    .frame(width: 5, height: 5)
                Text(label)
                    .font(.custom("SpaceGrotesk-Medium", size: 11))
                    .foregroundStyle(Theme.textMuted)
                Text("\(ids.count)")
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textWhisper)
                Spacer()
                groupToggleButton(emoji: "\u{1F442}", isOff: allSoundOff) {
                    let newVal: Bool? = allSoundOff ? nil : false
                    for id in ids { store.updateChannel(id) { $0.soundEnabled = newVal } }
                }
                groupToggleButton(emoji: "\u{1F441}", isOff: allVisualOff) {
                    let newVal: Bool? = allVisualOff ? nil : false
                    for id in ids { store.updateChannel(id) { $0.visualEnabled = newVal } }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
            .onTapGesture { collapsed.toggle() }

            // Sub-channel rows — collapsible
            if !collapsed {
                ForEach(ids, id: \.self) { id in
                    if let config = store.channels[id] {
                        ChannelRow(id: id, config: config, level: levels[id] ?? 0)
                    }
                }
            }
        }
    }

    private func groupToggleButton(emoji: String, isOff: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(emoji)
                .font(.system(size: 12))
                .frame(width: 24, height: 24)
                .background(isOff ? .clear : Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(isOff ? Color.white.opacity(0.06) : Color.white.opacity(0.1), lineWidth: 1)
                )
                .opacity(isOff ? 0.3 : 1)
        }
    }

}

// MARK: - Inline Config (Stocks & RSS)

struct StockSymbolsInline: View {
    @Environment(AppStore.self) private var store
    @State private var input = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 5) {
            ForEach(store.stockSymbols, id: \.self) { sym in
                HStack(spacing: 3) {
                    Text(sym)
                        .font(.custom("SpaceGrotesk-Regular", size: 10))
                        .foregroundStyle(Theme.textSecondary)
                    Button {
                        store.stockSymbols.removeAll { $0 == sym }
                        store.persistAfterEdit()
                    } label: {
                        Text("\u{00D7}")
                            .font(.system(size: 10))
                            .foregroundStyle(Color.white.opacity(0.3))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.white.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            TextField("ADD", text: $input)
                .font(.custom("SpaceGrotesk-Regular", size: 10))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 50)
                .textFieldStyle(.plain)
                .textInputAutocapitalization(.characters)
                .focused($focused)
                .onSubmit {
                    let sym = input.trimmingCharacters(in: .whitespaces).uppercased()
                    if !sym.isEmpty && !store.stockSymbols.contains(sym) {
                        store.stockSymbols.append(sym)
                        store.persistAfterEdit()
                    }
                    input = ""
                }
        }
        .padding(.leading, 52)
        .padding(.trailing, 14)
        .padding(.vertical, 4)
    }
}

struct RssFeedsInline: View {
    @Environment(AppStore.self) private var store
    @State private var input = ""
    @FocusState private var focused: Bool

    private func label(_ url: String) -> String {
        if let host = URL(string: url)?.host {
            return host.replacingOccurrences(of: "www.", with: "")
        }
        return String(url.prefix(20))
    }

    var body: some View {
        HStack(spacing: 5) {
            ForEach(store.rssFeeds, id: \.self) { feed in
                HStack(spacing: 3) {
                    Text(label(feed))
                        .font(.custom("SpaceGrotesk-Regular", size: 10))
                        .foregroundStyle(Theme.textSecondary)
                    Button {
                        store.rssFeeds.removeAll { $0 == feed }
                        store.persistAfterEdit()
                    } label: {
                        Text("\u{00D7}")
                            .font(.system(size: 10))
                            .foregroundStyle(Color.white.opacity(0.3))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.white.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            TextField("feed URL", text: $input)
                .font(.custom("SpaceGrotesk-Regular", size: 10))
                .foregroundStyle(Theme.textMuted)
                .frame(minWidth: 60)
                .textFieldStyle(.plain)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focused)
                .onSubmit {
                    let url = input.trimmingCharacters(in: .whitespaces)
                    if !url.isEmpty && !store.rssFeeds.contains(url) {
                        store.rssFeeds.append(url)
                        store.persistAfterEdit()
                    }
                    input = ""
                }
        }
        .padding(.leading, 52)
        .padding(.trailing, 14)
        .padding(.vertical, 4)
    }
}
