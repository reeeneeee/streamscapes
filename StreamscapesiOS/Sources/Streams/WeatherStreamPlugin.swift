import Foundation

struct WeatherStreamPlugin: StreamPlugin {
    let id = "weather"
    let baseURL: URL
    let lat: Double
    let lon: Double

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        let dp = try await fetchWeather()
                        continuation.yield(dp)
                    } catch {
                        // Silently retry on failure
                    }
                    try? await Task.sleep(for: .seconds(180)) // 3 min
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func fetchWeather() async throws -> DataPoint {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/streams/weather"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "lat", value: String(lat)),
            URLQueryItem(name: "lon", value: String(lon)),
        ]

        let (data, _) = try await URLSession.shared.data(from: components.url!)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]

        var fields: [String: Double] = [:]
        if let temp = json["feelsLike"] as? Double { fields["feelsLike"] = temp }
        if let clouds = json["clouds"] as? Double { fields["clouds"] = clouds }
        if let humidity = json["humidity"] as? Double { fields["humidity"] = humidity }
        if let windSpeed = json["windSpeed"] as? Double { fields["windSpeed"] = windSpeed }
        if let pressure = json["pressure"] as? Double { fields["pressure"] = pressure }

        return DataPoint(
            streamId: "weather",
            timestamp: Date(),
            fields: fields,
            metadata: [:]
        )
    }
}
