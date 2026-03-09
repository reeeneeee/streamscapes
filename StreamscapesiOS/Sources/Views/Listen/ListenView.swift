import SwiftUI

struct ListenView: View {
    @Environment(AppStore.self) private var store
    @Environment(AudioCoordinator.self) private var coordinator
    @Environment(LocationManager.self) private var location

    @State private var flightInfo: FlightInfoData? = nil

    struct FlightInfoData: Identifiable {
        let id = UUID()
        let callsign: String
        var json: String = "Loading..."
    }

    var body: some View {
        VStack(spacing: 0) {
            // Title + status
            VStack(spacing: 4) {
                Text("streamscapes")
                    .font(.custom("SpaceGrotesk-Light", size: 15))
                    .foregroundStyle(Theme.textSecondary)

                if let weather = store.weatherDisplay {
                    Text("\(String(format: "%.2f", location.latitude)), \(String(format: "%.2f", location.longitude)) · \(Int(weather.feelsLike))°F · \(Int(weather.clouds))% cloud cover")
                        .font(.custom("SpaceGrotesk-Regular", size: 11))
                        .foregroundStyle(Theme.textMuted)
                        .tracking(0.3)
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 6)

            GeometryReader { geo in
                ZStack {
                    TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
                        Canvas { context, size in
                            drawVisualizer(
                                context: &context,
                                size: size,
                                data: coordinator.visualizerData,
                                time: timeline.date.timeIntervalSinceReferenceDate
                            )
                        }
                        .frame(width: geo.size.width, height: geo.size.height)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { location in
                    handleTap(at: location, in: geo.size)
                }
            }
        }
        .sheet(item: $flightInfo) { info in
            FlightInfoSheet(info: info)
        }
    }

    private func handleTap(at point: CGPoint, in size: CGSize) {
        let cx = size.width / 2
        let cy = size.height / 2
        let scale = min(size.width, size.height)
        let geoScale = scale * 3
        let now = Date()

        for flight in coordinator.visualizerData.flights {
            guard !flight.callsign.isEmpty else { continue }

            // Dead-reckoning must match draw loop
            let elapsed = min(now.timeIntervalSince(flight.lastSeen), 30)
            let degPerSec = flight.gspeed / 216000
            let trackRad = flight.track * .pi / 180
            let dLat = degPerSec * cos(trackRad) * elapsed
            let dLon = degPerSec * sin(trackRad) * elapsed / cos(flight.lat * .pi / 180)
            let interpLat = flight.lat + dLat
            let interpLon = flight.lon + dLon

            let latDiff = interpLat - location.latitude
            let lonDiff = interpLon - location.longitude
            let x = cx + lonDiff * geoScale
            let y = cy - latDiff * geoScale
            let iconSize = lerp(value: min(flight.distance, 10), inMin: 0, inMax: 10, outMin: 36, outMax: 16)

            let dx = point.x - x
            let dy = point.y - y
            if sqrt(dx * dx + dy * dy) < iconSize {
                var info = FlightInfoData(callsign: flight.callsign)
                flightInfo = info
                Task {
                    do {
                        let url = URL(string: "https://api.adsbdb.com/v0/callsign/\(flight.callsign)")!
                        let (data, _) = try await URLSession.shared.data(from: url)
                        if let json = try? JSONSerialization.jsonObject(with: data),
                           let pretty = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted),
                           let str = String(data: pretty, encoding: .utf8) {
                            info.json = str
                        } else {
                            info.json = String(data: data, encoding: .utf8) ?? "No data"
                        }
                    } catch {
                        info.json = "{ \"error\": \"Failed to fetch\" }"
                    }
                    flightInfo = info
                }
                return
            }
        }
    }

    // MARK: - Drawing

    private func drawVisualizer(
        context: inout GraphicsContext,
        size: CGSize,
        data: VisualizerData,
        time: Double
    ) {
        let cx = size.width / 2
        let cy = size.height / 2
        let scale = min(size.width, size.height)

        // Scope disc
        let scopeRadius = scale * 0.42
        drawScopeDisc(context: &context, cx: cx, cy: cy, radius: scopeRadius)

        // Distance circles
        let distances: [CGFloat] = [0.12, 0.22, 0.34]
        for d in distances {
            let r = scale * d
            let rect = CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)
            context.stroke(
                Circle().path(in: rect),
                with: .color(Theme.accent.opacity(0.25)),
                lineWidth: 0.5
            )
        }

        // Center dot with glow
        drawCenterDot(context: &context, cx: cx, cy: cy)

        // Flight airplane icons — interpolate positions between API polls
        let geoScale = scale * 3
        let airplaneImage = context.resolve(
            Image(systemName: "airplane")
                .symbolRenderingMode(.monochrome)
        )
        let now = Date()
        for flight in data.flights {
            // Dead-reckoning: project forward using gspeed + track
            let elapsed = min(now.timeIntervalSince(flight.lastSeen), 30)
            // gspeed is knots (nm/hr). 1 nm ≈ 1/60°. → deg/sec = gspeed / 216000
            let degPerSec = flight.gspeed / 216000
            let trackRad = flight.track * .pi / 180
            let dLat = degPerSec * cos(trackRad) * elapsed
            let dLon = degPerSec * sin(trackRad) * elapsed / cos(flight.lat * .pi / 180)
            let interpLat = flight.lat + dLat
            let interpLon = flight.lon + dLon

            let latDiff = interpLat - location.latitude
            let lonDiff = interpLon - location.longitude
            let x = cx + lonDiff * geoScale
            let y = cy - latDiff * geoScale

            guard x > -50 && x < size.width + 50 && y > -50 && y < size.height + 50 else { continue }

            let iconSize: CGFloat = lerp(value: min(flight.distance, 10), inMin: 0, inMax: 10, outMin: 36, outMax: 16)

            // Glow behind airplane
            let glowRect = CGRect(x: x - iconSize * 0.8, y: y - iconSize * 0.8, width: iconSize * 1.6, height: iconSize * 1.6)
            context.fill(
                Circle().path(in: glowRect),
                with: .color(Theme.streamFlights.opacity(0.2))
            )

            // Draw rotated airplane
            var planeContext = context
            planeContext.translateBy(x: x, y: y)
            // SF Symbol airplane points right (east). Rotate by track (degrees from north, clockwise).
            // Convert: north=0° → rotate -90° offset, then add track.
            let radians = (flight.track - 90) * .pi / 180
            planeContext.rotate(by: .radians(radians))
            planeContext.opacity = 0.85
            planeContext.draw(
                airplaneImage,
                in: CGRect(x: -iconSize / 2, y: -iconSize / 2, width: iconSize, height: iconSize)
            )

            // Distance label
            let label = Text("\(Int(flight.distance)) mi")
                .font(.custom("SpaceGrotesk-Regular", size: 10))
                .foregroundStyle(Theme.streamFlights.opacity(0.7))
            context.draw(
                context.resolve(label),
                at: CGPoint(x: x, y: y + iconSize / 2 + 4),
                anchor: .top
            )
        }

        // Wiki ripples
        for edit in data.wikiEdits {
            let x = 50 + edit.posX * (size.width - 100)
            let y = 50 + edit.posY * (size.height - 100)
            let currentSize = edit.size * (1 - edit.age / 60)

            guard currentSize > 0 else { continue }

            // Ripple rings
            for i in stride(from: 3, through: 0, by: -1) {
                let rippleSize = currentSize * (1 + Double(i) * 0.3)
                let alpha = lerp(value: Double(i), inMin: 0, inMax: 3, outMin: 0.4, outMax: 0.06)
                let ringRect = CGRect(
                    x: x - rippleSize / 2,
                    y: y - rippleSize / 2,
                    width: rippleSize,
                    height: rippleSize
                )
                context.stroke(
                    Circle().path(in: ringRect),
                    with: .color(Theme.streamWiki.opacity(alpha)),
                    lineWidth: 1
                )
            }

            // Center dot
            let centerRect = CGRect(x: x - 2, y: y - 2, width: 4, height: 4)
            context.fill(
                Circle().path(in: centerRect),
                with: .color(Theme.streamWiki)
            )

            // Title for larger edits
            if edit.size > 30 && edit.age < 15 {
                let displayTitle = edit.title.count > 28
                    ? String(edit.title.prefix(25)) + "..."
                    : edit.title
                let titleLabel = Text(displayTitle)
                    .font(.custom("DMSans-Regular", size: 11))
                    .foregroundStyle(Theme.streamWiki.opacity(0.5))
                context.draw(
                    context.resolve(titleLabel),
                    at: CGPoint(x: x, y: y + currentSize / 2 + 8),
                    anchor: .top
                )
            }
        }

        // Stream status dots at bottom
        drawStatusDots(context: &context, size: size, time: time)
    }

    private func drawScopeDisc(context: inout GraphicsContext, cx: CGFloat, cy: CGFloat, radius: CGFloat) {
        // Outer glow
        let glowRect = CGRect(x: cx - radius * 1.15, y: cy - radius * 1.15, width: radius * 2.3, height: radius * 2.3)
        context.fill(
            Circle().path(in: glowRect),
            with: .color(Theme.accent.opacity(0.04))
        )

        // Dark disc
        let discRect = CGRect(x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2)
        context.fill(
            Circle().path(in: discRect),
            with: .color(Color.black.opacity(0.85))
        )

        // Rim
        context.stroke(
            Circle().path(in: CGRect(x: cx - radius * 0.95, y: cy - radius * 0.95, width: radius * 1.9, height: radius * 1.9)),
            with: .color(Theme.accent.opacity(0.1)),
            lineWidth: 1
        )
    }

    private func drawCenterDot(context: inout GraphicsContext, cx: CGFloat, cy: CGFloat) {
        // Glow
        let glowSize: CGFloat = 30
        let glowRect = CGRect(x: cx - glowSize / 2, y: cy - glowSize / 2, width: glowSize, height: glowSize)
        context.fill(
            Circle().path(in: glowRect),
            with: .color(Theme.accent.opacity(0.2))
        )

        // Dot
        let dotSize: CGFloat = 8
        let dotRect = CGRect(x: cx - dotSize / 2, y: cy - dotSize / 2, width: dotSize, height: dotSize)
        context.fill(
            Circle().path(in: dotRect),
            with: .color(Theme.accent)
        )
    }

    private func drawStatusDots(context: inout GraphicsContext, size: CGSize, time: Double) {
        let streams = ["weather", "flights", "wikipedia"]
        let y = size.height - 20
        let spacing: CGFloat = 40
        let startX = size.width / 2 - spacing * CGFloat(streams.count - 1) / 2

        for (i, id) in streams.enumerated() {
            let x = startX + CGFloat(i) * spacing
            let state = store.activeStreams[id]
            let color = Theme.streamColor(for: id)

            let dotSize: CGFloat = 5
            let dotRect = CGRect(x: x - dotSize / 2, y: y - dotSize / 2, width: dotSize, height: dotSize)

            let alpha: Double
            switch state {
            case .connected:
                alpha = 1.0
            case .connecting:
                // Pulse between 0.3 and 0.8
                alpha = 0.3 + 0.5 * (0.5 + 0.5 * sin(time * 4))
            default:
                alpha = 0.2
            }

            context.fill(
                Circle().path(in: dotRect),
                with: .color(color.opacity(alpha))
            )
        }
    }

    private func lerp(value: Double, inMin: Double, inMax: Double, outMin: Double, outMax: Double) -> Double {
        outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)
    }
}

private struct FlightInfoSheet: View {
    let info: ListenView.FlightInfoData
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(info.json)
                    .font(.custom("SpaceGrotesk-Regular", size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.bgPrimary)
            .navigationTitle(info.callsign)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
