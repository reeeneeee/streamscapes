import SwiftUI

struct ListenView: View {
    @Environment(AppStore.self) private var store
    @Environment(AudioCoordinator.self) private var coordinator

    var body: some View {
        VStack(spacing: 0) {
            Text("streamscapes")
                .font(.custom("SpaceGrotesk-Light", size: 15))
                .foregroundStyle(Theme.textSecondary)
                .padding(.top, 8)
                .padding(.bottom, 8)

            GeometryReader { geo in
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

        // Flight dots
        let geoScale = scale * 3
        for flight in data.flights {
            let myLat = 37.7749
            let myLon = -122.4194
            let latDiff = flight.lat - myLat
            let lonDiff = flight.lon - myLon
            let x = cx + lonDiff * geoScale
            let y = cy - latDiff * geoScale

            guard x > -50 && x < size.width + 50 && y > -50 && y < size.height + 50 else { continue }

            let dotSize: CGFloat = lerp(value: 1 / flight.distance, inMin: 0, inMax: 1, outMin: 4, outMax: 12)

            // Flight glow
            let glowRect = CGRect(x: x - dotSize * 2, y: y - dotSize * 2, width: dotSize * 4, height: dotSize * 4)
            context.fill(
                Circle().path(in: glowRect),
                with: .color(Theme.streamFlights.opacity(0.15))
            )

            // Flight dot
            let dotRect = CGRect(x: x - dotSize / 2, y: y - dotSize / 2, width: dotSize, height: dotSize)
            context.fill(
                Circle().path(in: dotRect),
                with: .color(Theme.streamFlights.opacity(0.8))
            )

            // Distance label
            if flight.distance < 8 {
                let label = Text("\(Int(flight.distance)) mi")
                    .font(.custom("SpaceGrotesk-Regular", size: 10))
                    .foregroundStyle(Theme.textWhisper)
                context.draw(
                    context.resolve(label),
                    at: CGPoint(x: x, y: y - dotSize - 6),
                    anchor: .bottom
                )
            }
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
        drawStatusDots(context: &context, size: size)
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

    private func drawStatusDots(context: inout GraphicsContext, size: CGSize) {
        let streams = ["weather", "flights", "wikipedia"]
        let y = size.height - 20
        let spacing: CGFloat = 40
        let startX = size.width / 2 - spacing * CGFloat(streams.count - 1) / 2

        for (i, id) in streams.enumerated() {
            let x = startX + CGFloat(i) * spacing
            let isActive = store.activeStreams[id] != nil
            let color = Theme.streamColor(for: id)

            let dotSize: CGFloat = 5
            let dotRect = CGRect(x: x - dotSize / 2, y: y - dotSize / 2, width: dotSize, height: dotSize)
            context.fill(
                Circle().path(in: dotRect),
                with: .color(isActive ? color : color.opacity(0.2))
            )
        }
    }

    private func lerp(value: Double, inMin: Double, inMax: Double, outMin: Double, outMax: Double) -> Double {
        outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)
    }
}
