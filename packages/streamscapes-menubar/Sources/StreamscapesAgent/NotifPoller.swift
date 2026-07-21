import Foundation

final class NotifPoller {
    private let client: OTLPClient
    private let callback: (PollerEvent) -> Void
    private let pollInterval: TimeInterval = 3
    private let macEpochOffset: Double = 978307200

    private var timer: Timer?
    private var seenIds = Set<Int>()
    private var lastDate: Double
    private var lastSuccessfulPoll: Date?
    private let dbPath: String
    private let plistPath: String

    init(endpoint: String, apiKey: String, callback: @escaping (PollerEvent) -> Void) {
        self.client = OTLPClient(endpoint: endpoint, apiKey: apiKey)
        self.callback = callback
        self.lastDate = Date().timeIntervalSince1970 - macEpochOffset
        self.dbPath = NSHomeDirectory() + "/Library/Group Containers/group.com.apple.usernoted/db2/db"
        self.plistPath = NSTemporaryDirectory() + "ss_notif_\(ProcessInfo.processInfo.processIdentifier).plist"
    }

    func start() {
        callback(.log("Notifications: polling every \(Int(pollInterval))s"))
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func resetAfterWake() {
        lastDate = Date().timeIntervalSince1970 - macEpochOffset - 30
    }

    private func poll() {
        let query = """
        SELECT r.rec_id, a.identifier, r.delivered_date \
        FROM record r JOIN app a ON r.app_id = a.app_id \
        WHERE r.delivered_date > \(lastDate) \
        ORDER BY r.delivered_date ASC LIMIT 50;
        """

        let (output, error) = shell("sqlite3", "-json", dbPath, query)

        if let error, (error.contains("authorization denied") || error.contains("not permitted") || error.contains("unable to open")) {
            // Only flag FDA if we've never successfully read the DB
            if seenIds.isEmpty && lastSuccessfulPoll == nil {
                callback(.fdaRequired)
            }
            return
        }

        lastSuccessfulPoll = Date()

        guard let output, !output.isEmpty,
              let data = output.data(using: .utf8),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return }

        let newRows = rows.filter { row in
            guard let recId = row["rec_id"] as? Int else { return false }
            return !seenIds.contains(recId)
        }
        guard !newRows.isEmpty else { return }

        callback(.log("\(newRows.count) new notifications"))

        // Cap at 8 per poll to avoid flooding the audio engine
        let capped = Array(newRows.prefix(8))

        Task {
            for (i, row) in capped.enumerated() {
                guard let recId = row["rec_id"] as? Int,
                      let identifier = row["identifier"] as? String,
                      let deliveredDate = row["delivered_date"] as? Double
                else { continue }

                seenIds.insert(recId)
                lastDate = max(lastDate, deliveredDate)

                // Stagger sends to avoid audio engine overload
                if i > 0 {
                    try? await Task.sleep(nanoseconds: 200_000_000) // 200ms
                }

                let svc = appName(identifier)
                let content = getContent(recId: recId)
                let name = content.title.map { "\(svc): \($0)" } ?? svc
                let tsMs = Int64((deliveredDate + macEpochOffset) * 1000)

                var fields: [String: Any] = ["notification.app": identifier]
                if let body = content.body { fields["notification.body"] = body }

                let result = await client.postSpan(
                    source: "notify", serviceName: svc, spanName: name,
                    fields: fields, timestampMs: tsMs
                )

                if result.ok {
                    callback(.authOk)
                    callback(.spanSent(svc))
                } else if result.status == 401 {
                    callback(.authError)
                }
            }
        }

        // Mark remaining as seen so they don't pile up
        for row in newRows.dropFirst(8) {
            if let recId = row["rec_id"] as? Int,
               let deliveredDate = row["delivered_date"] as? Double {
                seenIds.insert(recId)
                lastDate = max(lastDate, deliveredDate)
            }
        }

        // Prune
        if seenIds.count > 500 {
            seenIds = Set(Array(seenIds).suffix(250))
        }
    }

    private func appName(_ bundleId: String) -> String {
        bundleId.split(separator: ".").last.map(String.init) ?? bundleId
    }

    private func getContent(recId: Int) -> (title: String?, body: String?) {
        let _ = shell("sqlite3", dbPath,
            "SELECT writefile('\(plistPath)', data) FROM record WHERE rec_id = \(recId);")
        let (raw, _) = shell("plutil", "-p", plistPath)
        guard let raw else { return (nil, nil) }

        func extract(_ key: String) -> String? {
            let pattern = "\"\(key)\"\\s*=>\\s*\"([^\"]*)\""
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: raw, range: NSRange(raw.startIndex..., in: raw)),
                  let range = Range(match.range(at: 1), in: raw)
            else { return nil }
            return String(raw[range])
        }

        return (extract("titl"), extract("body"))
    }

    @discardableResult
    private func shell(_ args: String...) -> (String?, String?) {
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = args
        process.standardOutput = stdout
        process.standardError = stderr
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return (nil, error.localizedDescription)
        }
        let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (out?.isEmpty == true ? nil : out, err?.isEmpty == true ? nil : err)
    }
}
