import Foundation

struct WikiStreamPlugin: StreamPlugin {
    let id = "wikipedia"
    let baseURL: URL

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    try await streamSSE(continuation: continuation)
                } catch {
                    // Stream ended or was cancelled
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func streamSSE(continuation: AsyncStream<DataPoint>.Continuation) async throws {
        let url = baseURL.appendingPathComponent("/api/wiki-stream")
        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 300

        let (bytes, _) = try await URLSession.shared.bytes(from: url)
        var buffer = ""

        for try await byte in bytes {
            if Task.isCancelled { break }

            let char = String(UnicodeScalar(byte))
            buffer += char

            // SSE messages are delimited by double newlines
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

            // Filter: non-minor, main namespace (no ":" in title)
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
