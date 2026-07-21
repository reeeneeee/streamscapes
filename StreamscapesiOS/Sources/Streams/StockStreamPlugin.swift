import Foundation

/// Polls stock quotes via the web API proxy, matching the web stocks plugin.
/// Reads symbols from the store on each cycle so config changes take effect live.
struct StockStreamPlugin: StreamPlugin {
    let id = "stocks"
    let getSymbols: @Sendable () async -> [String]

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                var prevPrices: [String: Double] = [:]

                while !Task.isCancelled {
                    let symbols = await getSymbols()

                    for symbol in symbols {
                        if Task.isCancelled { break }
                        do {
                            let url = URL(string: "https://www.streamscapes.fm/api/streams/stocks?symbol=\(symbol)")!
                            let (data, response) = try await URLSession.shared.data(from: url)
                            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { continue }
                            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }

                            let price = json["c"] as? Double ?? 0
                            let prevClose = json["pc"] as? Double ?? price
                            let prevPrice = prevPrices[symbol] ?? price
                            let priceDelta = price - prevPrice
                            let priceDeltaPct = prevPrice > 0 ? abs((priceDelta / prevPrice) * 100) : 0
                            let changeFromClose = json["dp"] as? Double ?? 0

                            prevPrices[symbol] = price

                            if price > 0 {
                                continuation.yield(DataPoint(
                                    streamId: "stocks",
                                    timestamp: Date(),
                                    fields: [
                                        "price": price,
                                        "prevClose": prevClose,
                                        "changeFromClose": changeFromClose,
                                        "priceDelta": priceDelta,
                                        "priceDeltaPct": priceDeltaPct,
                                        "direction": priceDelta >= 0 ? 1 : 0,
                                        "dayHigh": json["h"] as? Double ?? price,
                                        "dayLow": json["l"] as? Double ?? price,
                                    ],
                                    metadata: ["symbol": symbol]
                                ))
                            }
                        } catch is CancellationError {
                            break
                        } catch {
                            // skip this symbol
                        }
                    }

                    // Finnhub free tier: 60 calls/min — poll every 30s
                    try? await Task.sleep(for: .seconds(30))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
