import SwiftUI

struct SettingsShareView: View {
    @Environment(AppStore.self) private var store
    @Environment(AuthManager.self) private var authManager

    @State private var showSave = false
    @State private var saveName = ""
    @State private var savedPresets: [SavedPresetEntry] = []
    @State private var communityPresets: [CommunityPresetEntry] = []
    @State private var shareResult: String?
    @State private var loadingCommunity = false

    private static let baseURL = "https://streamscapes.fm"

    struct SavedPresetEntry: Identifiable, Codable {
        let id: String
        let name: String
        let savedAt: String
        let global: GlobalConfig
        let channels: [String: ChannelConfig]
    }

    struct CommunityPresetEntry: Identifiable, Codable {
        var id: String { slug }
        let slug: String
        let name: String
        let userId: String?
        let username: String?
        let createdAt: String?
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Text("Settings")
                    .font(.custom("SpaceGrotesk-Medium", size: 13))
                    .foregroundStyle(Theme.textSecondary)
                Spacer()
                if authManager.isSignedIn {
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { showSave.toggle() }
                    } label: {
                        Text(showSave ? "cancel" : "save current")
                            .font(.custom("DMSans-Regular", size: 11))
                            .foregroundStyle(showSave ? Theme.textPrimary : Theme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(showSave ? Color.white.opacity(0.12) : Color.white.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
                            )
                    }
                }
            }

            // Save form
            if showSave {
                HStack(spacing: 6) {
                    TextField(defaultName(), text: $saveName)
                        .font(.custom("DMSans-Regular", size: 12))
                        .foregroundStyle(Theme.textPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                        .onSubmit { saveAndShare() }

                    Button { savePrivately() } label: {
                        Text("save")
                            .font(.custom("DMSans-Regular", size: 11))
                            .foregroundStyle(Theme.textMuted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }

                    Button { saveAndShare() } label: {
                        Text("save + share")
                            .font(.custom("DMSans-Regular", size: 11))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(Theme.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
            }

            // Share result
            if let result = shareResult {
                Text(result)
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.03))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            // My presets
            if !savedPresets.isEmpty {
                Text("MY PRESETS")
                    .font(.custom("DMSans-Regular", size: 9))
                    .tracking(1)
                    .foregroundStyle(Theme.textWhisper)
                    .padding(.top, 4)

                ForEach(savedPresets) { preset in
                    HStack(spacing: 8) {
                        Text(preset.name)
                            .font(.custom("DMSans-Regular", size: 12))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                        Spacer()
                        if authManager.isSignedIn {
                            Button { sharePreset(preset) } label: {
                                Text("share")
                                    .font(.custom("DMSans-Regular", size: 10))
                                    .foregroundStyle(Theme.textWhisper)
                            }
                        }
                        Button { deleteLocal(preset) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9))
                                .foregroundStyle(Theme.textWhisper)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.03))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .contentShape(Rectangle())
                    .onTapGesture { loadLocal(preset) }
                }
            }

            // Community
            HStack {
                Text("COMMUNITY")
                    .font(.custom("DMSans-Regular", size: 9))
                    .tracking(1)
                    .foregroundStyle(Theme.textWhisper)
                Spacer()
                Button { fetchCommunity() } label: {
                    Text(loadingCommunity ? "..." : "refresh")
                        .font(.custom("DMSans-Regular", size: 10))
                        .foregroundStyle(Theme.textWhisper)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.white.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
            }
            .padding(.top, 4)

            if communityPresets.isEmpty {
                Text(loadingCommunity ? "loading..." : "no shared presets yet")
                    .font(.custom("DMSans-Regular", size: 11))
                    .foregroundStyle(Theme.textWhisper)
            } else {
                ForEach(communityPresets) { preset in
                    HStack(spacing: 8) {
                        Text(preset.name)
                            .font(.custom("DMSans-Regular", size: 12))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                        Spacer()
                        Text(preset.username ?? "anon")
                            .font(.custom("DMSans-Regular", size: 10))
                            .foregroundStyle(Theme.textWhisper)
                        if let myId = authManager.user?.id, preset.userId == myId {
                            Button { unshare(preset.slug) } label: {
                                Text("unshare")
                                    .font(.custom("DMSans-Regular", size: 10))
                                    .foregroundStyle(Color.red.opacity(0.5))
                            }
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.03))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .contentShape(Rectangle())
                    .onTapGesture { loadCommunity(preset.slug) }
                }
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .onAppear { fetchCommunity() }
    }

    // MARK: - Actions

    private func defaultName() -> String {
        let d = Date()
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.string(from: d)
    }

    private func savePrivately() {
        let name = saveName.isEmpty ? defaultName() : saveName
        let entry = SavedPresetEntry(
            id: UUID().uuidString,
            name: name,
            savedAt: ISO8601DateFormatter().string(from: Date()),
            global: store.global,
            channels: store.channels
        )
        savedPresets.insert(entry, at: 0)
        saveName = ""
        showSave = false
        persistLocal()
    }

    private func saveAndShare() {
        let name = saveName.isEmpty ? defaultName() : saveName
        let entry = SavedPresetEntry(
            id: UUID().uuidString,
            name: name,
            savedAt: ISO8601DateFormatter().string(from: Date()),
            global: store.global,
            channels: store.channels
        )
        savedPresets.insert(entry, at: 0)
        saveName = ""
        showSave = false
        persistLocal()
        sharePreset(entry)
    }

    private func sharePreset(_ preset: SavedPresetEntry) {
        guard let token = authManager.token else {
            shareResult = "Sign in to share"
            return
        }
        // Strip private channels
        let publicIds: Set<String> = ["weather", "weather:temp", "weather:clouds", "flights", "wikipedia", "rss", "stocks"]
        let publicChannels = preset.channels.filter { publicIds.contains($0.key) }

        Task {
            var req = URLRequest(url: URL(string: "\(Self.baseURL)/api/presets")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let body: [String: Any] = [
                "name": preset.name,
                "global": encodable(preset.global),
                "channels": publicChannels.mapValues { encodable($0) },
            ]
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
            do {
                let (data, resp) = try await URLSession.shared.data(for: req)
                if let http = resp as? HTTPURLResponse, http.statusCode == 200,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let slug = json["slug"] as? String {
                    await MainActor.run {
                        shareResult = "shared: \(slug)"
                        UIPasteboard.general.string = "\(Self.baseURL)/?preset=\(slug)"
                        fetchCommunity()
                    }
                } else {
                    await MainActor.run { shareResult = "Failed to share" }
                }
            } catch {
                await MainActor.run { shareResult = "Network error" }
            }
        }
    }

    private func loadLocal(_ preset: SavedPresetEntry) {
        store.global = preset.global
        for (id, config) in preset.channels {
            store.channels[id] = config
        }
        store.onReconcileNeeded?()
    }

    private func deleteLocal(_ preset: SavedPresetEntry) {
        savedPresets.removeAll { $0.id == preset.id }
        persistLocal()
    }

    private func fetchCommunity() {
        loadingCommunity = true
        Task {
            var req = URLRequest(url: URL(string: "\(Self.baseURL)/api/presets")!)
            if let token = authManager.token {
                req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            do {
                let (data, _) = try await URLSession.shared.data(for: req)
                let presets = try JSONDecoder().decode([CommunityPresetEntry].self, from: data)
                await MainActor.run {
                    communityPresets = presets
                    loadingCommunity = false
                }
            } catch {
                await MainActor.run { loadingCommunity = false }
            }
        }
    }

    private func loadCommunity(_ slug: String) {
        Task {
            let req = URLRequest(url: URL(string: "\(Self.baseURL)/api/presets/\(slug)")!)
            do {
                let (data, _) = try await URLSession.shared.data(for: req)
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let globalData = json["globalConfig"],
                       let gData = try? JSONSerialization.data(withJSONObject: globalData),
                       let g = try? JSONDecoder().decode(GlobalConfig.self, from: gData) {
                        await MainActor.run { store.global = g }
                    }
                    if let chData = json["channelsConfig"],
                       let cData = try? JSONSerialization.data(withJSONObject: chData),
                       let channels = try? JSONDecoder().decode([String: ChannelConfig].self, from: cData) {
                        await MainActor.run {
                            for (id, config) in channels {
                                store.channels[id] = config
                            }
                        }
                    }
                    await MainActor.run { store.onReconcileNeeded?() }
                }
            } catch {
                print("[SettingsShare] Failed to load community preset: \(error)")
            }
        }
    }

    private func unshare(_ slug: String) {
        guard let token = authManager.token else { return }
        Task {
            var req = URLRequest(url: URL(string: "\(Self.baseURL)/api/presets?slug=\(slug)")!)
            req.httpMethod = "DELETE"
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: req)
            await MainActor.run { fetchCommunity() }
        }
    }

    // MARK: - Local Persistence (UserDefaults)

    private static let localKey = "com.streamscapes.savedPresets"

    private func persistLocal() {
        if let data = try? JSONEncoder().encode(savedPresets) {
            UserDefaults.standard.set(data, forKey: Self.localKey)
        }
    }

    private func loadLocalPresets() {
        if let data = UserDefaults.standard.data(forKey: Self.localKey),
           let presets = try? JSONDecoder().decode([SavedPresetEntry].self, from: data) {
            savedPresets = presets
        }
    }

    // MARK: - Codable helpers

    private func encodable<T: Encodable>(_ value: T) -> Any {
        guard let data = try? JSONEncoder().encode(value),
              let obj = try? JSONSerialization.jsonObject(with: data) else { return [:] }
        return obj
    }
}

extension SettingsShareView {
    func onAppearLoad() -> some View {
        self.onAppear { loadLocalPresets() }
    }
}
