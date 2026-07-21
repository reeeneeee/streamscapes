import Foundation

/// Connects to the SSE ingest stream to receive Datadog, notification,
/// GitHub, and OTLP spans — the same data the web app gets.
struct IngestStreamPlugin: StreamPlugin {
    let id = "otlp"
    let token: String
    let baseURL: String

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        try await streamSSE(continuation: continuation)
                    } catch {
                        print("[Ingest] Stream error: \(error), reconnecting in 5s...")
                    }
                    try? await Task.sleep(for: .seconds(5))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func streamSSE(continuation: AsyncStream<DataPoint>.Continuation) async throws {
        let url = URL(string: "\(baseURL)/api/ingest/stream")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("streamscapes-ios/1.0", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 90

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[Ingest] SSE returned \(code)")
            return
        }

        var buffer = ""
        for try await byte in bytes {
            if Task.isCancelled { break }
            buffer.append(Character(UnicodeScalar(byte)))

            if buffer.hasSuffix("\n\n") {
                parseSSEBlock(buffer, continuation: continuation)
                buffer = ""
            }
        }
    }

    private static let sourcePrefixes: [String: String] = [
        "otlp": "otlp",
        "datadog": "dd",
        "github": "github",
        "notify": "notify",
        "browser": "chrome",
        "system": "system",
        "watch": "watch",
    ]

    private func parseSSEBlock(_ block: String, continuation: AsyncStream<DataPoint>.Continuation) {
        for line in block.components(separatedBy: "\n") {
            guard line.hasPrefix("data: ") else { continue }
            let jsonStr = String(line.dropFirst(6))

            guard let data = jsonStr.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let serviceName = json["serviceName"] as? String
            else { continue }

            let source = json["source"] as? String ?? "otlp"
            let prefix = Self.sourcePrefixes[source] ?? "otlp"
            let spanName = json["spanName"] as? String ?? "unknown"
            // System health + watch: use spanName (cpu, memory, heartRate) instead of serviceName
            let streamId = (source == "system" || source == "watch")
                ? "\(prefix):\(spanName)"
                : "\(prefix):\(serviceName)"

            let durationMs = json["durationMs"] as? Double ?? 0
            let statusCode = json["statusCode"] as? Double ?? 1
            let kind = json["kind"] as? Double ?? 0
            let timestamp = json["timestamp"] as? Double ?? Date().timeIntervalSince1970 * 1000

            // Merge extra attributes (system health sends percent, usedGB, etc.)
            var fields: [String: Double] = [
                "durationMs": durationMs,
                "noteDurationMs": durationMs,
                "isError": statusCode == 2 ? 1 : 0,
                "statusCode": statusCode,
                "spanKind": kind,
            ]
            if let attrs = json["attributes"] as? [String: Any] {
                for (key, val) in attrs {
                    if let num = val as? Double { fields[key] = num }
                    else if let num = val as? Int { fields[key] = Double(num) }
                }
            }

            let dp = DataPoint(
                streamId: streamId,
                timestamp: Date(timeIntervalSince1970: timestamp / 1000),
                fields: fields,
                metadata: [
                    "spanName": spanName,
                ]
            )
            continuation.yield(dp)
        }
    }
}
