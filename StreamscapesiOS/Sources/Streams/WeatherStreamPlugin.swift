import Foundation

struct WeatherStreamPlugin: StreamPlugin {
    let id = "weather"
    let lat: Double
    let lon: Double
    let apiKey: String

    func connect() -> AsyncStream<DataPoint> {
        AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    do {
                        let dp = try await fetchWeather()
                        continuation.yield(dp)
                        print("[Weather] Got data: \(dp.fields)")
                    } catch {
                        print("[Weather] Fetch failed: \(error)")
                    }
                    try? await Task.sleep(for: .seconds(180))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func fetchWeather() async throws -> DataPoint {
        let url = URL(string: "https://api.openweathermap.org/data/2.5/weather?lat=\(lat)&lon=\(lon)&appid=\(apiKey)&units=imperial")!
        let (data, _) = try await URLSession.shared.data(from: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]

        var fields: [String: Double] = [:]

        // Main weather data
        if let main = json["main"] as? [String: Any] {
            if let feelsLike = main["feels_like"] as? Double { fields["feelsLike"] = feelsLike }
            if let humidity = main["humidity"] as? Double { fields["humidity"] = humidity }
            if let pressure = main["pressure"] as? Double { fields["pressure"] = pressure }
            if let temp = main["temp"] as? Double { fields["temperature"] = temp }
        }
        if let clouds = (json["clouds"] as? [String: Any])?["all"] as? Double {
            fields["clouds"] = clouds
        }
        if let wind = json["wind"] as? [String: Any] {
            if let speed = wind["speed"] as? Double { fields["windSpeed"] = speed }
        }

        return DataPoint(
            streamId: "weather",
            timestamp: Date(),
            fields: fields,
            metadata: [:]
        )
    }
}
