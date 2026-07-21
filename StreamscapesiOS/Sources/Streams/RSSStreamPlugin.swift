import Foundation

/// Polls RSS feeds via the web API proxy, matching the web rss plugin.
/// Reads feed URLs from the store on each cycle so config changes take effect live.
struct RSSStreamPlugin: StreamPlugin {
    let id = "rss"
    let getFeeds: @Sendable () async -> [String]

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                var seenIds = Set<String>()

                while !Task.isCancelled {
                    let feedUrls = await getFeeds()

                    for feedUrl in feedUrls {
                        if Task.isCancelled { break }
                        do {
                            let encoded = feedUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? feedUrl
                            let url = URL(string: "https://www.streamscapes.fm/api/streams/rss?url=\(encoded)")!
                            let (data, response) = try await URLSession.shared.data(from: url)
                            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { continue }
                            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                                  let items = json["items"] as? [[String: Any]] else { continue }

                            for item in items {
                                let link = item["link"] as? String ?? ""
                                let title = item["title"] as? String ?? "Untitled"
                                let itemId = link.isEmpty ? title : link
                                guard !seenIds.contains(itemId) else { continue }
                                seenIds.insert(itemId)

                                let contentLength = Double((item["contentSnippet"] as? String ?? item["content"] as? String ?? "").count)

                                continuation.yield(DataPoint(
                                    streamId: "rss",
                                    timestamp: Date(),
                                    fields: [
                                        "titleLength": Double(title.count),
                                        "contentLength": contentLength,
                                        "hasImage": item["enclosure"] != nil ? 1 : 0,
                                    ],
                                    metadata: [
                                        "title": title,
                                        "feedUrl": feedUrl,
                                    ]
                                ))
                            }
                        } catch is CancellationError {
                            break
                        } catch {
                            // skip this feed
                        }
                    }

                    // Prune seen IDs to prevent unbounded growth
                    if seenIds.count > 500 {
                        seenIds = Set(Array(seenIds).suffix(250))
                    }

                    // Poll every 2 minutes
                    try? await Task.sleep(for: .seconds(120))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
