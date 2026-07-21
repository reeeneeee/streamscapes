import Foundation

final class DatadogPoller {
    private let client: OTLPClient
    private let ddApiKey: String
    private let ddAppKey: String
    private let ddSite: String
    private let ddQuery: String
    private let enableMonitors: Bool
    private let monitorTags: String
    private let callback: (PollerEvent) -> Void
    private let pollInterval: TimeInterval = 5
    private let monitorPollInterval: TimeInterval = 30
    private let lookbackMs: Int64 = 60_000

    private var spanTimer: Timer?
    private var monitorTimer: Timer?
    private var seenIds = Set<String>()
    private var prevMonitorStates: [Int: String] = [:]

    init(endpoint: String, apiKey: String,
         ddApiKey: String, ddAppKey: String, ddSite: String,
         ddQuery: String = "*",
         enableSpans: Bool = true,
         enableMonitors: Bool = false,
         monitorTags: String = "",
         callback: @escaping (PollerEvent) -> Void) {
        self.client = OTLPClient(endpoint: endpoint, apiKey: apiKey)
        self.ddApiKey = ddApiKey
        self.ddAppKey = ddAppKey
        self.ddSite = ddSite
        self.ddQuery = ddQuery
        self.enableMonitors = enableMonitors
        self.monitorTags = monitorTags
        self.callback = callback
    }

    func start() {
        callback(.log("Datadog: polling \(ddSite) every \(Int(pollInterval))s"))
        poll()
        spanTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }

        if enableMonitors {
            callback(.log("Datadog: polling monitors every \(Int(monitorPollInterval))s"))
            pollMonitors()
            monitorTimer = Timer.scheduledTimer(withTimeInterval: monitorPollInterval, repeats: true) { [weak self] _ in
                self?.pollMonitors()
            }
        }
    }

    func stop() {
        spanTimer?.invalidate()
        spanTimer = nil
        monitorTimer?.invalidate()
        monitorTimer = nil
    }

    private func poll() {
        Task {
            await fetchAndForward()
        }
    }

    private func pollMonitors() {
        Task {
            await fetchMonitors()
        }
    }

    private func fetchAndForward() async {
        let now = ISO8601DateFormatter().string(from: Date())
        let from = ISO8601DateFormatter().string(from: Date(timeIntervalSinceNow: -Double(lookbackMs) / 1000))

        let body: [String: Any] = [
            "data": [
                "attributes": [
                    "filter": ["query": ddQuery, "from": from, "to": now],
                    "page": ["limit": 50],
                    "sort": "timestamp",
                ],
                "type": "search_request",
            ],
        ]

        guard let url = URL(string: "https://api.\(ddSite)/api/v2/spans/events/search"),
              let jsonData = try? JSONSerialization.data(withJSONObject: body)
        else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(ddApiKey, forHTTPHeaderField: "DD-API-KEY")
        request.setValue(ddAppKey, forHTTPHeaderField: "DD-APPLICATION-KEY")
        request.httpBody = jsonData

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let httpResponse = response as? HTTPURLResponse
        else { return }

        if httpResponse.statusCode == 429 {
            callback(.log("Datadog: rate limited"))
            return
        }
        guard 200...299 ~= httpResponse.statusCode else {
            callback(.log("Datadog: API error \(httpResponse.statusCode)"))
            return
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let spans = json["data"] as? [[String: Any]]
        else { return }

        var count = 0
        for span in spans {
            let id = "\(span["id"] ?? "")"
            guard !seenIds.contains(id) else { continue }
            seenIds.insert(id)

            let attrs = span["attributes"] as? [String: Any] ?? [:]
            let service = "\(attrs["service"] ?? "unknown")"
            let name = "\(attrs["resource_name"] ?? attrs["operation_name"] ?? "unknown")"
            let status = "\(attrs["status"] ?? "ok")"

            let result = await client.postSpan(
                source: "datadog", serviceName: service, spanName: name,
                statusCode: status == "error" ? 2 : 1
            )

            if result.ok {
                callback(.authOk)
                callback(.spanSent(service))
                count += 1
            } else if result.status == 401 {
                callback(.authError)
            }
        }

        if count > 0 { callback(.log("Datadog: \(count) new spans")) }

        // Prune
        if seenIds.count > 1000 {
            seenIds = Set(Array(seenIds).suffix(500))
        }
    }

    // MARK: - Monitor polling

    private func slugify(_ name: String) -> String {
        name.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private func monitorStatusCode(_ status: String) -> Int {
        switch status {
        case "Alert", "Warn": return 2
        case "OK": return 1
        default: return 0
        }
    }

    private func fetchMonitors() async {
        var components = URLComponents(string: "https://api.\(ddSite)/api/v1/monitor")!
        var queryItems: [URLQueryItem] = []
        if !monitorTags.isEmpty {
            queryItems.append(URLQueryItem(name: "monitor_tags", value: monitorTags))
        }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else { return }

        var request = URLRequest(url: url)
        request.setValue(ddApiKey, forHTTPHeaderField: "DD-API-KEY")
        request.setValue(ddAppKey, forHTTPHeaderField: "DD-APPLICATION-KEY")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let httpResponse = response as? HTTPURLResponse
        else { return }

        if httpResponse.statusCode == 429 {
            callback(.log("Datadog monitors: rate limited"))
            return
        }
        guard 200...299 ~= httpResponse.statusCode else {
            callback(.log("Datadog monitors: API error \(httpResponse.statusCode)"))
            return
        }

        guard let monitors = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return }

        for monitor in monitors {
            guard let id = monitor["id"] as? Int,
                  let name = monitor["name"] as? String,
                  let state = monitor["overall_state"] as? String
            else { continue }

            let prev = prevMonitorStates[id]

            // Only send on first poll or state change
            guard prev == nil || prev != state else { continue }

            if let prev {
                callback(.log("Monitor: \(name) \(prev) → \(state)"))
            }
            prevMonitorStates[id] = state

            let service = slugify(name)
            let durationMs: Int = state == "Alert" ? 10000
                : state == "Warn" ? 5000
                : state == "OK" ? 100
                : 1

            let result = await client.postSpan(
                source: "datadog",
                serviceName: service,
                spanName: "monitor.\(state.lowercased().replacingOccurrences(of: " ", with: "_"))",
                fields: [
                    "monitor.id": id,
                    "monitor.status": state,
                    "durationMs": durationMs,
                ],
                statusCode: monitorStatusCode(state)
            )

            if result.ok {
                callback(.authOk)
                callback(.spanSent("monitor:\(service)"))
            } else if result.status == 401 {
                callback(.authError)
            }
        }
    }
}
