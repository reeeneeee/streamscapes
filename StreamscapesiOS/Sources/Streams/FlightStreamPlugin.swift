import Foundation

struct FlightStreamPlugin: StreamPlugin {
    let id = "flights"
    let lat: Double
    let lon: Double

    func connect() -> AsyncStream<DataPoint> {
        return AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        let flights = try await fetchFlights()
                        for dp in flights {
                            continuation.yield(dp)
                        }
                    } catch {
                        print("[Flights] Fetch failed: \(error)")
                    }
                    try? await Task.sleep(for: .seconds(15))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// Fetches from Airplanes.live (free, no API key, community ADS-B network)
    private func fetchFlights() async throws -> [DataPoint] {
        let url = URL(string: "https://api.airplanes.live/v2/point/\(String(format: "%.4f", lat))/\(String(format: "%.4f", lon))/25")!
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        let aircraft = json["ac"] as? [[String: Any]] ?? []

        return aircraft.compactMap { ac -> DataPoint? in
            guard let acLat = ac["lat"] as? Double,
                  let acLon = ac["lon"] as? Double else { return nil }

            // Skip grounded aircraft
            if let altBaro = ac["alt_baro"] as? String, altBaro == "ground" { return nil }

            let distance = coordDistanceMiles(lat1: lat, lon1: lon, lat2: acLat, lon2: acLon)
            let gsKnots = ac["gs"] as? Double ?? 0
            let speedMph = gsKnots * 1.15078
            let altFeet = ac["alt_baro"] as? Double ?? 0
            let altMeters = altFeet * 0.3048
            let track = ac["track"] as? Double ?? 0
            let callsign = (ac["flight"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""

            let maxDist = 10.0
            let minFreq = 110.0
            let maxFreq = 880.0
            let frequency = minFreq * pow(maxFreq / minFreq, max(0, maxDist - distance) / maxDist)

            return DataPoint(
                streamId: "flights",
                timestamp: Date(),
                fields: [
                    "distance": distance,
                    "altitude": altMeters,
                    "speed": speedMph,
                    "frequency": frequency,
                    "lat": acLat,
                    "lon": acLon,
                    "track": track,
                ],
                metadata: [
                    "callsign": callsign.isEmpty ? (ac["hex"] as? String ?? "") : callsign,
                ]
            )
        }
    }

    private func coordDistanceMiles(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        sqrt(pow(lat2 - lat1, 2) + pow(lon2 - lon1, 2)) * 69
    }
}
