import SwiftUI

struct AtmosphereBackground: View {
    var body: some View {
        ZStack {
            // Rose blob — top left
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Theme.streamWeather.opacity(0.5), Theme.streamWeather.opacity(0.1), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 170
                    )
                )
                .frame(width: 340, height: 300)
                .offset(x: -100, y: -200)
                .blur(radius: 60)

            // Blue blob — mid right
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Theme.streamFlights.opacity(0.4), Theme.streamFlights.opacity(0.07), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 140
                    )
                )
                .frame(width: 280, height: 260)
                .offset(x: 100, y: -20)
                .blur(radius: 60)

            // Green blob — bottom
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Theme.streamWikipedia.opacity(0.35), Theme.streamWikipedia.opacity(0.05), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 150
                    )
                )
                .frame(width: 300, height: 240)
                .offset(x: 0, y: 250)
                .blur(radius: 60)
        }
    }
}
