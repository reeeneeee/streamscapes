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
            var hitLat = flight.lat + dLat
            var hitLon = flight.lon + dLon
            if let prevLat = flight.prevLat, let prevLon = flight.prevLon, let prevTime = flight.prevTime {
                let blendElapsed = now.timeIntervalSince(prevTime)
                if blendElapsed < 1.0 {
                    let t = blendElapsed
                    let ease = 1 - (1 - t) * (1 - t) * (1 - t)
                    hitLat = prevLat + (hitLat - prevLat) * ease
                    hitLon = prevLon + (hitLon - prevLon) * ease
                }
            }

            let latDiff = hitLat - location.latitude
            let lonDiff = hitLon - location.longitude
            let x = cx + lonDiff * geoScale
            let y = cy - latDiff * geoScale
            let iconSize = lerp(value: min(flight.distance, 10), inMin: 0, inMax: 10, outMin: 36, outMax: 16)

            let dx = point.x - x
            let dy = point.y - y
            if sqrt(dx * dx + dy * dy) < max(iconSize, 20) { // min 20pt tap target
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

        // Wiki edit tap → open Wikipedia article
        for edit in coordinator.visualizerData.wikiEdits {
            let ex = 50 + edit.posX * (size.width - 100)
            let ey = 50 + edit.posY * (size.height - 100)
            let dx = point.x - ex
            let dy = point.y - ey
            if sqrt(dx * dx + dy * dy) < 25 {
                let encoded = edit.title.replacingOccurrences(of: " ", with: "_")
                    .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? edit.title
                if let url = URL(string: "https://en.wikipedia.org/wiki/\(encoded)") {
                    UIApplication.shared.open(url)
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
            Image("airplane")
                .renderingMode(.original)
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
            var interpLat = flight.lat + dLat
            var interpLon = flight.lon + dLon

            // Smooth blend from previous interpolated position over 1s to avoid jumps
            if let prevLat = flight.prevLat, let prevLon = flight.prevLon, let prevTime = flight.prevTime {
                let blendElapsed = now.timeIntervalSince(prevTime)
                let blendDuration = 1.0
                if blendElapsed < blendDuration {
                    let t = blendElapsed / blendDuration
                    // Ease-out cubic
                    let ease = 1 - (1 - t) * (1 - t) * (1 - t)
                    interpLat = prevLat + (interpLat - prevLat) * ease
                    interpLon = prevLon + (interpLon - prevLon) * ease
                }
            }

            let latDiff = interpLat - location.latitude
            let lonDiff = interpLon - location.longitude
            let x = cx + lonDiff * geoScale
            let y = cy - latDiff * geoScale

            guard x > -50 && x < size.width + 50 && y > -50 && y < size.height + 50 else { continue }

            // Smaller planes for mobile (web: 36–16, iOS: 22–10)
            let iconSize: CGFloat = lerp(value: min(flight.distance, 10), inMin: 0, inMax: 10, outMin: 36, outMax: 16)

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

            // Distance label — above plane, matching web's bluish-grey
            let flightLabelColor = Color(red: 92/255, green: 114/255, blue: 133/255).opacity(0.7)
            let label = Text("\(Int(flight.distance)) mi")
                .font(.custom("SpaceGrotesk-Regular", size: 10))
                .foregroundStyle(flightLabelColor)
            context.draw(
                context.resolve(label),
                at: CGPoint(x: x, y: y - iconSize / 2 - 8),
                anchor: .bottom
            )
        }

        // Ingest rain — falling labels (matches web Visualizer.tsx)
        for drop in data.ingestDrops {
            let dx = drop.x * size.width
            let dy = drop.y * size.height
            guard dy > -20 && dy < size.height + 20 && !drop.label.isEmpty else { continue }

            let labelText = Text(String(drop.label.prefix(24)))
                .font(.custom("SpaceGrotesk-Regular", size: 9))
                .foregroundStyle(drop.color.opacity(drop.opacity))
            if drop.isError {
                let boldText = Text(String(drop.label.prefix(24)))
                    .font(.custom("SpaceGrotesk-Bold", size: 9))
                    .foregroundStyle(drop.color.opacity(drop.opacity))
                context.draw(context.resolve(boldText), at: CGPoint(x: dx, y: dy), anchor: .center)
            } else {
                context.draw(context.resolve(labelText), at: CGPoint(x: dx, y: dy), anchor: .center)
            }
        }

        // Wiki ripples
        for edit in data.wikiEdits {
            let x = 50 + edit.posX * (size.width - 100)
            let y = 50 + edit.posY * (size.height - 100)
            let currentSize = edit.size * (1 - edit.age / 60)

            guard currentSize > 0 else { continue }

            // Ripple rings — bluish-grey matching web rgba(77, 108, 129, α)
            let wikiRippleColor = Color(red: 77/255, green: 108/255, blue: 129/255)
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
                    with: .color(wikiRippleColor.opacity(alpha)),
                    lineWidth: 1.5
                )
            }

            // Center dot (smaller for mobile)
            let centerRect = CGRect(x: x - 2, y: y - 2, width: 4, height: 4)
            context.fill(
                Circle().path(in: centerRect),
                with: .color(wikiRippleColor)
            )

            // Title for larger edits
            if edit.size > 30 && edit.age < 20 {
                let displayTitle = edit.title.count > 28
                    ? String(edit.title.prefix(25)) + "..."
                    : edit.title
                let wikiTitleColor = Color(red: 77/255, green: 108/255, blue: 129/255)
                let titleLabel = Text(displayTitle)
                    .font(.custom("DMSans-Regular", size: 11))
                    .foregroundStyle(wikiTitleColor.opacity(0.5))
                context.draw(
                    context.resolve(titleLabel),
                    at: CGPoint(x: x, y: y + currentSize / 2 + 8),
                    anchor: .top
                )
            }
        }

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
        let glowSize: CGFloat = 20
        let glowRect = CGRect(x: cx - glowSize / 2, y: cy - glowSize / 2, width: glowSize, height: glowSize)
        context.fill(
            Circle().path(in: glowRect),
            with: .color(Theme.accent.opacity(0.2))
        )

        // Dot (web: 5px radius = 10px diameter)
        let dotSize: CGFloat = 6
        let dotRect = CGRect(x: cx - dotSize / 2, y: cy - dotSize / 2, width: dotSize, height: dotSize)
        context.fill(
            Circle().path(in: dotRect),
            with: .color(Theme.accent)
        )
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
