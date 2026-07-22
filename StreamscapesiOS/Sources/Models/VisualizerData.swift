import Foundation
import Observation
import SwiftUI

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
        // Previous interpolated position for smooth blending on API updates
        var prevLat: Double?
        var prevLon: Double?
        var prevTime: Date?
    }

    struct WikiRipple: Identifiable {
        let id: String
        let title: String
        let size: Double
        var age: Double = 0
        let posX: Double // 0-1 normalized
        let posY: Double // 0-1 normalized
    }

    struct IngestDrop: Identifiable {
        let id = UUID()
        var x: Double      // normalised 0-1 horizontal
        var y: Double      // normalised 0 (top) → 1+ (off-screen)
        let speed: Double   // normalised units per 30ms tick
        let color: Color
        let size: Double    // radius px
        var opacity: Double
        let label: String
        let isError: Bool
    }

    var flights: [FlightDot] = []
    var wikiEdits: [WikiRipple] = []
    var ingestDrops: [IngestDrop] = []
    private var ageTimer: Timer?
    private var lastDropTime: Date = .distantPast

    /// Neon palette for personal signal channels — matches web OTLP_COLORS
    private static let otlpColors: [Color] = {
        let hexes: [UInt] = [
            0x00E5FF, 0xFF3DFF, 0x39FF14, 0xFFD600, 0x7C4DFF, 0x00FFAB,
            0xFF6E40, 0x76FF03, 0xE040FB, 0x18FFFF, 0xFFAB40, 0x00E676,
        ]
        return hexes.map { Color(hex: $0) }
    }()
    private var otlpColorMap: [String: Color] = [:]
    private var otlpColorIndex = 0

    func ingestColor(for streamId: String) -> Color {
        if let c = otlpColorMap[streamId] { return c }
        let c = Self.otlpColors[otlpColorIndex % Self.otlpColors.count]
        otlpColorIndex += 1
        otlpColorMap[streamId] = c
        return c
    }

    func addIngestDrop(from dp: DataPoint) {
        // Throttle: max ~3 drops/sec
        let now = Date()
        guard now.timeIntervalSince(lastDropTime) >= 0.3 else { return }
        guard ingestDrops.count < 60 else { return }
        lastDropTime = now

        let isError = dp.fields["isError"] == 1 || dp.fields["statusCode"] == 2
        let color = isError ? Color(hex: 0xEF4444) : ingestColor(for: dp.streamId)
        let label = dp.metadata["spanName"] ?? String(dp.streamId.split(separator: ":").last ?? "")

        let drop = IngestDrop(
            x: 0.05 + Double.random(in: 0...0.9),
            y: -0.02 - Double.random(in: 0...0.03),
            speed: 0.004 + Double.random(in: 0...0.003),
            color: color,
            size: isError ? 5 : 3 + Double.random(in: 0...1.5),
            opacity: 0.8,
            label: label,
            isError: isError
        )
        ingestDrops.append(drop)
    }

    func startAging() {
        ageTimer?.invalidate()
        // Match web: 30ms interval, +0.045 age per tick → expiry (age 30) at ~20s
        ageTimer = Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.wikiEdits = self.wikiEdits
                    .map { var e = $0; e.age += 0.045; return e }
                    .filter { $0.age < 30 }

                if !self.ingestDrops.isEmpty {
                    self.ingestDrops = self.ingestDrops
                        .map { var d = $0; d.y += d.speed; d.opacity -= 0.0012; return d }
                        .filter { $0.y < 1.2 && $0.opacity > 0.02 }
                }
            }
        }
    }

    func stopAging() {
        ageTimer?.invalidate()
        ageTimer = nil
    }

    func updateFlights(from dataPoints: [DataPoint]) {
        let now = Date()
        let oldFlights = flights
        flights = dataPoints.compactMap { dp in
            guard let lat = dp.fields["lat"],
                  let lon = dp.fields["lon"],
                  let distance = dp.fields["distance"] else { return nil }
            let flightId = dp.metadata["callsign"] ?? UUID().uuidString

            // Capture previous interpolated position for smooth blending
            var prevLat: Double?
            var prevLon: Double?
            var prevTime: Date?
            if let existing = oldFlights.first(where: { $0.id == flightId }) {
                let elapsed = min(now.timeIntervalSince(existing.lastSeen), 30)
                let degPerSec = existing.gspeed / 216000
                let trackRad = existing.track * .pi / 180
                prevLat = existing.lat + degPerSec * cos(trackRad) * elapsed
                prevLon = existing.lon + degPerSec * sin(trackRad) * elapsed / cos(existing.lat * .pi / 180)
                prevTime = now
            }

            return FlightDot(
                id: flightId,
                lat: lat,
                lon: lon,
                distance: distance,
                altitude: dp.fields["altitude"] ?? 0,
                callsign: dp.metadata["callsign"] ?? "",
                track: dp.fields["track"] ?? 0,
                // Stream yields mph; dead-reckoning (gspeed / 216000) expects knots
                gspeed: (dp.fields["speed"] ?? 0) / 1.15078,
                lastSeen: now,
                prevLat: prevLat,
                prevLon: prevLon,
                prevTime: prevTime
            )
        }
    }

    func addWikiEdit(from dp: DataPoint) {
        let title = dp.metadata["title"] ?? ""
        let absLen = dp.fields["absLengthDelta"] ?? 10
        // Scale down for mobile screens (web uses 10–100, iOS 5–40)
        let size = min(40, max(5, absLen * 0.4))

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
