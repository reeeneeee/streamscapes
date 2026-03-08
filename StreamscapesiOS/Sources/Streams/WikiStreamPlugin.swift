import Foundation

struct WikiStreamPlugin: StreamPlugin {
    let id = "wikipedia"

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                // Reconnect loop
                while !Task.isCancelled {
                    do {
                        try await streamSSE(continuation: continuation)
                    } catch {
                        print("[Wiki] Stream error: \(error), reconnecting in 5s...")
                    }
                    try? await Task.sleep(for: .seconds(5))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func streamSSE(continuation: AsyncStream<DataPoint>.Continuation) async throws {
        let url = URL(string: "https://stream.wikimedia.org/v2/stream/mediawiki.recentchange")!
        var request = URLRequest(url: url)
        request.setValue("streamscapes/1.0", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 300

        let (bytes, _) = try await URLSession.shared.bytes(for: request)
        var buffer = ""

        for try await byte in bytes {
            if Task.isCancelled { break }

            buffer.append(Character(UnicodeScalar(byte)))

            if buffer.hasSuffix("\n\n") {
                processSSEBlock(buffer, continuation: continuation)
                buffer = ""
            }
        }
    }

    private func processSSEBlock(_ block: String, continuation: AsyncStream<DataPoint>.Continuation) {
        for line in block.components(separatedBy: "\n") {
            guard line.hasPrefix("data: ") else { continue }
            let jsonStr = String(line.dropFirst(6))

            guard let data = jsonStr.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }

            // Filter: en.wikipedia.org, edits only, non-minor, main namespace
            guard json["server_name"] as? String == "en.wikipedia.org",
                  json["type"] as? String == "edit" else { continue }

            let minor = json["minor"] as? Bool ?? true
            let title = json["title"] as? String ?? ""
            guard !minor, !title.contains(":") else { continue }

            let lengthNew = (json["length"] as? [String: Any])?["new"] as? Double ?? 0
            let lengthOld = (json["length"] as? [String: Any])?["old"] as? Double ?? 0
            let lengthDelta = lengthNew - lengthOld

            let dp = DataPoint(
                streamId: "wikipedia",
                timestamp: Date(),
                fields: [
                    "titleLength": Double(title.count),
                    "lengthDelta": lengthDelta,
                    "absLengthDelta": abs(lengthDelta),
                ],
                metadata: [
                    "title": title,
                ]
            )
            continuation.yield(dp)
        }
    }
}
