import Foundation

struct FlightStreamPlugin: StreamPlugin {
    let id = "flights"
    let baseURL: URL
    let lat: Double
    let lon: Double

    func connect() -> AsyncStream<DataPoint> {
        let bounds = "\(lat + 0.07),\(lat - 0.07),\(lon - 0.07),\(lon + 0.07)"

        return AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        let flights = try await fetchFlights(bounds: bounds)
                        for dp in flights {
                            continuation.yield(dp)
                        }
                    } catch {
                        // Silently retry
                    }
                    try? await Task.sleep(for: .seconds(10))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func fetchFlights(bounds: String) async throws -> [DataPoint] {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/streams/flights"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "bounds", value: bounds),
        ]

        let (data, _) = try await URLSession.shared.data(from: components.url!)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        let flights = json["data"] as? [[String: Any]] ?? []

        return flights.compactMap { flight -> DataPoint? in
            guard let flightLat = flight["lat"] as? Double,
                  let flightLon = flight["lon"] as? Double else { return nil }

            let distance = coordDistanceMiles(lat1: lat, lon1: lon, lat2: flightLat, lon2: flightLon)
            let altitude = flight["alt"] as? Double ?? 0
            let speed = (flight["gspeed"] as? Double ?? 0) * 1.15 // knots → mph

            let maxDist = 10.0
            let minFreq = 110.0
            let maxFreq = 880.0
            let frequency = minFreq * pow(maxFreq / minFreq, max(0, maxDist - distance) / maxDist)

            var fields: [String: Double] = [
                "distance": distance,
                "altitude": altitude,
                "speed": speed,
                "frequency": frequency,
            ]
            if let id = flight["fr24_id"] as? String {
                fields["flightId"] = Double(id.hashValue & 0xFFFF)
            }

            return DataPoint(
                streamId: "flights",
                timestamp: Date(),
                fields: fields,
                metadata: [
                    "callsign": flight["callsign"] as? String ?? "",
                ]
            )
        }
    }

    private func coordDistanceMiles(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        sqrt(pow(lat2 - lat1, 2) + pow(lon2 - lon1, 2)) * 69
    }
}
