import Foundation
import Observation

@MainActor
@Observable
final class VisualizerData {
    struct FlightDot: Identifiable {
        let id: String
        let lat: Double
        let lon: Double
        let distance: Double
        let altitude: Double
        let callsign: String
        let track: Double // heading in degrees
        let gspeed: Double // ground speed in knots
        let lastSeen: Date
    }

    struct WikiRipple: Identifiable {
        let id: String
        let title: String
        let size: Double
        var age: Double = 0
        let posX: Double // 0-1 normalized
        let posY: Double // 0-1 normalized
    }

    var flights: [FlightDot] = []
    var wikiEdits: [WikiRipple] = []
    private var ageTimer: Timer?

    func startAging() {
        ageTimer?.invalidate()
        ageTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.wikiEdits = self.wikiEdits
                    .map { var e = $0; e.age += 0.1; return e }
                    .filter { $0.age < 30 }
            }
        }
    }

    func stopAging() {
        ageTimer?.invalidate()
        ageTimer = nil
    }

    func updateFlights(from dataPoints: [DataPoint]) {
        flights = dataPoints.compactMap { dp in
            guard let lat = dp.fields["lat"],
                  let lon = dp.fields["lon"],
                  let distance = dp.fields["distance"] else { return nil }
            return FlightDot(
                id: dp.metadata["callsign"] ?? UUID().uuidString,
                lat: lat,
                lon: lon,
                distance: distance,
                altitude: dp.fields["altitude"] ?? 0,
                callsign: dp.metadata["callsign"] ?? "",
                track: dp.fields["track"] ?? 0,
                gspeed: dp.fields["speed"] ?? 0,
                lastSeen: Date()
            )
        }
    }

    func addWikiEdit(from dp: DataPoint) {
        let title = dp.metadata["title"] ?? ""
        let absLen = dp.fields["absLengthDelta"] ?? 10
        let size = min(100, max(10, absLen))

        // Deterministic position from title hash
        let hx = fnv1a(title, seed: 0x811c9dc5)
        let hy = fnv1a(title, seed: 0x6c62272e)
        let posX = Double(hx) / Double(UInt32.max)
        let posY = Double(hy) / Double(UInt32.max)

        let ripple = WikiRipple(
            id: "\(Date().timeIntervalSince1970)-\(title.hashValue)",
            title: title,
            size: size,
            posX: posX,
            posY: posY
        )
        wikiEdits = [ripple] + wikiEdits.prefix(49)
    }

    private func fnv1a(_ input: String, seed: UInt32) -> UInt32 {
        var h = seed
        for byte in input.utf8 {
            h ^= UInt32(byte)
            h = h &* 0x01000193
        }
        return h
    }
}
