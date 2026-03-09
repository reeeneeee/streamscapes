import Foundation

struct FlightStreamPlugin: StreamPlugin {
    let id = "flights"
    let lat: Double
    let lon: Double
    let apiKey: String

    func connect() -> AsyncStream<DataPoint> {
        let bounds = "\(lat + 0.15),\(lat - 0.15),\(lon - 0.15),\(lon + 0.15)"

        return AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        let flights = try await fetchFlights(bounds: bounds)
                        for dp in flights {
                            continuation.yield(dp)
                        }
                    } catch {
                        print("[Flights] Fetch failed: \(error)")
                    }
                    try? await Task.sleep(for: .seconds(60))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func fetchFlights(bounds: String) async throws -> [DataPoint] {
        let url = URL(string: "https://fr24api.flightradar24.com/api/live/flight-positions/light?bounds=\(bounds)")!
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("v1", forHTTPHeaderField: "Accept-Version")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let (data, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        let flights = json["data"] as? [[String: Any]] ?? []

        return flights.compactMap { flight -> DataPoint? in
            guard let flightLat = flight["lat"] as? Double,
                  let flightLon = flight["lon"] as? Double else { return nil }

            let distance = coordDistanceMiles(lat1: lat, lon1: lon, lat2: flightLat, lon2: flightLon)
            let altitude = flight["alt"] as? Double ?? 0
            let speed = (flight["gspeed"] as? Double ?? 0) * 1.15

            let maxDist = 10.0
            let minFreq = 110.0
            let maxFreq = 880.0
            let frequency = minFreq * pow(maxFreq / minFreq, max(0, maxDist - distance) / maxDist)

            return DataPoint(
                streamId: "flights",
                timestamp: Date(),
                fields: [
                    "distance": distance,
                    "altitude": altitude,
                    "speed": speed,
                    "frequency": frequency,
                    "lat": flightLat,
                    "lon": flightLon,
                    "track": flight["track"] as? Double ?? 0,
                ],
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
