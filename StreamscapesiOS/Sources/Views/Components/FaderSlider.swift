import SwiftUI

/// Audio-equipment-style fader: thin rounded track with a small rectangular thumb.
struct FaderSlider: View {
    @Binding var value: Double
    var range: ClosedRange<Double>
    var step: Double = 0.5
    var trackColor: Color = Color.white.opacity(0.1)
    var thumbColor: Color = Color.white.opacity(0.55)
    var levelFill: Double = 0
    var levelColor: Color = .clear

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let fraction = (value - range.lowerBound) / (range.upperBound - range.lowerBound)
            let thumbX = fraction * width

            ZStack(alignment: .leading) {
                // Track
                RoundedRectangle(cornerRadius: 2)
                    .fill(trackColor)
                    .frame(height: 4)

                // VU level fill
                if levelFill > 0 {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(levelColor)
                        .opacity(0.35 + levelFill * 0.35)
                        .frame(width: max(0, width * levelFill), height: 4)
                        .animation(.linear(duration: 0.05), value: levelFill)
                }

                // Thumb
                RoundedRectangle(cornerRadius: 2)
                    .fill(thumbColor)
                    .frame(width: 14, height: 10)
                    .offset(x: max(0, min(thumbX - 7, width - 14)))
            }
            .frame(height: geo.size.height)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        let fraction = max(0, min(1, drag.location.x / width))
                        let raw = range.lowerBound + fraction * (range.upperBound - range.lowerBound)
                        let stepped = (raw / step).rounded() * step
                        value = max(range.lowerBound, min(range.upperBound, stepped))
                    }
            )
        }
        .frame(height: 18)
    }
}
