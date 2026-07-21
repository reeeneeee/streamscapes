import Foundation
import Combine

@MainActor
final class AgentViewModel: ObservableObject {
    // Config
    @Published var endpoint = "https://www.streamscapes.fm"
    @Published var apiKey = ""
    @Published var enableNotif = true
    @Published var enableSystem = true
    @Published var enableDd = false
    @Published var ddApiKey = ""
    @Published var ddAppKey = ""
    @Published var ddSite = "datadoghq.com"
    @Published var ddQuery = ""
    @Published var enableDdMonitors = false
    @Published var ddMonitorTags = ""

    // State
    @Published var state: AgentState = .idle
    @Published var spanCount = 0
    @Published var errorMessage: String?
    @Published var fdaRequired = false
    @Published var lastLog: String?
    @Published var updateAvailable: String?

    private var notifPoller: NotifPoller?
    private var systemPoller: SystemHealthPoller?
    private var ddPoller: DatadogPoller?
    private var consecutive401s = 0

    enum AgentState { case idle, running, error }

    // MARK: - Config persistence

    private static let defaults = UserDefaults.standard
    private static let keychainService = "com.streamscapes.agent"

    func loadConfig() {
        let d = Self.defaults
        endpoint = d.string(forKey: "endpoint") ?? "https://www.streamscapes.fm"
        apiKey = d.string(forKey: "apiKey") ?? ""
        enableNotif = d.object(forKey: "enableNotif") as? Bool ?? true
        enableSystem = d.object(forKey: "enableSystem") as? Bool ?? true
        enableDd = d.object(forKey: "enableDd") as? Bool ?? false
        ddApiKey = d.string(forKey: "ddApiKey") ?? ""
        ddAppKey = d.string(forKey: "ddAppKey") ?? ""
        ddSite = d.string(forKey: "ddSite") ?? "datadoghq.com"
        ddQuery = d.string(forKey: "ddQuery") ?? ""
        enableDdMonitors = d.object(forKey: "enableDdMonitors") as? Bool ?? false
        ddMonitorTags = d.string(forKey: "ddMonitorTags") ?? ""
    }

    func saveConfig() {
        let d = Self.defaults
        d.set(endpoint, forKey: "endpoint")
        d.set(apiKey, forKey: "apiKey")
        d.set(enableNotif, forKey: "enableNotif")
        d.set(enableSystem, forKey: "enableSystem")
        d.set(enableDd, forKey: "enableDd")
        d.set(ddSite, forKey: "ddSite")
        d.set(ddApiKey, forKey: "ddApiKey")
        d.set(ddAppKey, forKey: "ddAppKey")
        d.set(ddQuery, forKey: "ddQuery")
        d.set(enableDdMonitors, forKey: "enableDdMonitors")
        d.set(ddMonitorTags, forKey: "ddMonitorTags")
    }

    // MARK: - Keychain

    private static func writeKeychain(account: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        if !value.isEmpty {
            var add = query
            add[kSecValueData as String] = data
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private static func readKeychain(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Agent lifecycle

    func start() {
        guard state != .running else { return }
        guard !apiKey.isEmpty else {
            state = .error
            errorMessage = "API key required"
            return
        }

        saveConfig()
        state = .running
        spanCount = 0
        errorMessage = nil
        fdaRequired = false
        consecutive401s = 0

        let baseUrl = endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let traceEndpoint = baseUrl + "/api/ingest/otlp/v1/traces"

        // Verify API key immediately
        Task {
            let verifyUrl = baseUrl + "/api/auth/verify"
            guard let url = URL(string: verifyUrl) else { return }
            var req = URLRequest(url: url)
            req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            req.setValue(kAgentVersion, forHTTPHeaderField: "X-Agent-Version")
            do {
                let (_, res) = try await URLSession.shared.data(for: req)
                if let http = res as? HTTPURLResponse {
                    if let updateUrl = http.value(forHTTPHeaderField: "X-Agent-Update") {
                        await MainActor.run { self.updateAvailable = updateUrl }
                    }
                }
                if let http = res as? HTTPURLResponse, http.statusCode == 401 {
                    await MainActor.run {
                        stop()
                        state = .error
                        errorMessage = "Invalid API key"
                    }
                    return
                }
            } catch {
                await MainActor.run {
                    stop()
                    state = .error
                    errorMessage = "Cannot reach server — check URL"
                }
                return
            }
        }

        if enableNotif {
            notifPoller = NotifPoller(endpoint: traceEndpoint, apiKey: apiKey) { [weak self] event in
                Task { @MainActor in self?.handleEvent(event) }
            }
            notifPoller?.start()
        }

        if enableSystem {
            let systemEndpoint = traceEndpoint + "?source=system"
            systemPoller = SystemHealthPoller(endpoint: systemEndpoint, apiKey: apiKey) { [weak self] event in
                Task { @MainActor in self?.handleEvent(event) }
            }
            systemPoller?.start()
        }

        if enableDd, !ddApiKey.isEmpty, !ddAppKey.isEmpty {
            ddPoller = DatadogPoller(
                endpoint: traceEndpoint, apiKey: apiKey,
                ddApiKey: ddApiKey, ddAppKey: ddAppKey, ddSite: ddSite,
                ddQuery: ddQuery.isEmpty ? "*" : ddQuery,
                enableMonitors: enableDdMonitors,
                monitorTags: ddMonitorTags
            ) { [weak self] event in
                Task { @MainActor in self?.handleEvent(event) }
            }
            ddPoller?.start()
        }
    }

    func stop() {
        notifPoller?.stop()
        systemPoller?.stop()
        ddPoller?.stop()
        notifPoller = nil
        systemPoller = nil
        ddPoller = nil
        state = .idle
    }

    private func handleEvent(_ event: PollerEvent) {
        switch event {
        case .spanSent(let service):
            spanCount += 1
            lastLog = service
        case .log(let msg):
            lastLog = msg
        case .authError:
            consecutive401s += 1
            if consecutive401s >= 3 {
                stop()
                state = .error
                errorMessage = "API key invalid or revoked"
            }
        case .authOk:
            consecutive401s = 0
        case .fdaRequired:
            fdaRequired = true
        case .error(let msg):
            lastLog = msg
        }
    }
}

enum PollerEvent {
    case spanSent(String)
    case log(String)
    case authError
    case authOk
    case fdaRequired
    case error(String)
}
