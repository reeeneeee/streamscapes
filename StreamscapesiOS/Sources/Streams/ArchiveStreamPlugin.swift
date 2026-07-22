import Foundation

/// Polls the web API for Internet Archive changes and yields events
/// with mediatype-based pitch mapping, matching the web archive stream.
private struct ArchiveOfflineError: Error {
    let statusCode: Int
}

struct ArchiveStreamPlugin: StreamPlugin {
    let id = "archive"

    private static let mediatypeIndex: [String: Int] = [
        "texts": 0, "audio": 1, "movies": 2, "software": 3,
        "web": 4, "image": 5, "data": 6, "collection": 7,
    ]

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        print("[Archive] polling...")
                        let items = try await poll()
                        print("[Archive] got \(items.count) items")

                        // Distribute items evenly across ~15s with jitter
                        let totalInterval: Double = items.isEmpty ? 15.0 : 15.0
                        let slotMs = items.count > 0 ? totalInterval / Double(items.count) : totalInterval

                        for (i, item) in items.enumerated() {
                            let mediatype = item.mediatype
                            let mIdx = Self.mediatypeIndex[mediatype] ?? 6
                            let title = item.title ?? item.identifier

                            // Item age in years — unknown publicdate counts as brand new
                            var ageYears: Double = 0
                            if let pd = item.publicdate,
                               let date = ISO8601DateFormatter().date(from: pd) {
                                ageYears = max(0, Date().timeIntervalSince(date) / 31_557_600)
                            }

                            let dp = DataPoint(
                                streamId: "archive",
                                timestamp: Date(),
                                fields: [
                                    "mediatypeIndex": Double(mIdx),
                                    "titleLength": Double(title.count),
                                    "downloads": item.downloads,
                                    "ageYears": ageYears,
                                ],
                                metadata: [
                                    "identifier": item.identifier,
                                    "mediatype": mediatype,
                                    "title": title,
                                    "collection": item.collection ?? "",
                                ]
                            )
                            continuation.yield(dp)

                            // Wait between items (skip for last)
                            if i < items.count - 1 {
                                let jitter = slotMs * Double.random(in: 0.7...1.3)
                                try await Task.sleep(for: .seconds(jitter))
                            }
                        }
                    } catch is CancellationError {
                        break
                    } catch let err as ArchiveOfflineError {
                        let dp = DataPoint(
                            streamId: "archive",
                            timestamp: Date(),
                            fields: ["titleLength": 0, "mediatypeIndex": 0],
                            metadata: ["title": "offline (\(err.statusCode))"]
                        )
                        continuation.yield(dp)
                        try? await Task.sleep(for: .seconds(30))
                        continue
                    } catch {
                        print("[Archive] error: \(error), retrying in 15s...")
                    }

                    try? await Task.sleep(for: .seconds(15))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: - API

    private struct ArchiveItem {
        let identifier: String
        let mediatype: String
        let title: String?
        let collection: String?
        let downloads: Double
        let publicdate: String?
    }

    private func poll() async throws -> [ArchiveItem] {
        let url = URL(string: "https://www.streamscapes.fm/api/streams/archive")!
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[Archive] upstream error: \(code)")
            throw ArchiveOfflineError(statusCode: code)
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawItems = json["items"] as? [[String: Any]] else {
            return []
        }

        return rawItems.map { item in
            ArchiveItem(
                identifier: item["identifier"] as? String ?? "unknown",
                mediatype: item["mediatype"] as? String ?? "unknown",
                title: item["title"] as? String,
                collection: item["collection"] as? String,
                downloads: (item["downloads"] as? NSNumber)?.doubleValue ?? 0,
                publicdate: item["publicdate"] as? String
            )
        }
    }
}
