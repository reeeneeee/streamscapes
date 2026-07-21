import Foundation
import Observation
import WatchConnectivity

@Observable
@MainActor
final class WatchViewModel: NSObject {
    // Config
    var endpoint = "https://www.streamscapes.fm"
    var apiKey = ""

    // State
    var state: AgentState = .idle
    var spanCount = 0
    var errorMessage: String?
    var waitingForPhone = false

    private var poller: HealthPoller?
    private var consecutive401s = 0

    enum AgentState { case idle, running, error }

    // MARK: - Config persistence

    func loadConfig() {
        endpoint = UserDefaults.standard.string(forKey: "endpoint") ?? "https://www.streamscapes.fm"
        apiKey = UserDefaults.standard.string(forKey: "apiKey") ?? ""
        if apiKey.isEmpty {
            waitingForPhone = true
        }
    }

    func saveConfig() {
        UserDefaults.standard.set(endpoint, forKey: "endpoint")
        UserDefaults.standard.set(apiKey, forKey: "apiKey")
    }

    // MARK: - WatchConnectivity

    func activateSession() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()

        // Check application context for API key (sent while watch was unreachable)
        let ctx = session.receivedApplicationContext
        if let key = ctx["apiKey"] as? String, !key.isEmpty {
            receiveCredentials(key, endpoint: ctx["endpoint"] as? String)
        }
    }

    private func receiveCredentials(_ key: String, endpoint ep: String?) {
        apiKey = key
        if let ep, !ep.isEmpty { endpoint = ep }
        waitingForPhone = false
        saveConfig()
        // Auto-start if not already running
        if state != .running {
            start()
        }
    }

    // MARK: - Lifecycle

    func start() {
        guard state != .running else { return }
        guard !apiKey.isEmpty else {
            state = .error
            errorMessage = "Waiting for API key from iPhone"
            waitingForPhone = true
            return
        }

        saveConfig()
        state = .running
        spanCount = 0
        errorMessage = nil
        consecutive401s = 0

        let baseUrl = endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let traceEndpoint = baseUrl + "/api/ingest/otlp/v1/traces"

        let client = OTLPClient(endpoint: traceEndpoint, apiKey: apiKey)
        let healthPoller = HealthPoller(client: client) { [weak self] event in
            Task { @MainActor in
                self?.handleEvent(event)
            }
        }
        poller = healthPoller

        Task {
            let authorized = await healthPoller.requestAuthorization()
            guard authorized else {
                state = .error
                errorMessage = "HealthKit access denied"
                return
            }
            healthPoller.start()
        }
    }

    func stop() {
        poller?.stop()
        poller = nil
        state = .idle
    }

    private func handleEvent(_ event: PollerEvent) {
        switch event {
        case .spanSent:
            spanCount += 1
        case .authError:
            consecutive401s += 1
            if consecutive401s >= 3 {
                stop()
                state = .error
                errorMessage = "API key invalid or revoked"
            }
        case .error(let msg):
            errorMessage = msg
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchViewModel: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error {
            print("[WatchSession] activation error: \(error.localizedDescription)")
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            if let key = message["apiKey"] as? String {
                receiveCredentials(key, endpoint: message["endpoint"] as? String)
            } else if message["signedOut"] != nil {
                stop()
                apiKey = ""
                saveConfig()
                waitingForPhone = true
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in
            if let key = applicationContext["apiKey"] as? String {
                receiveCredentials(key, endpoint: applicationContext["endpoint"] as? String)
            } else if applicationContext["signedOut"] != nil {
                stop()
                apiKey = ""
                saveConfig()
                waitingForPhone = true
            }
        }
    }
}
