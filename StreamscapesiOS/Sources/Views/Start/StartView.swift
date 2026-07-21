import SwiftUI

struct StartView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            Theme.bgPrimary.ignoresSafeArea()
            AtmosphereBackground()

            // Full-screen tap to start playback
            Button {
                store.setPlaying(true)
            } label: {
                Color.clear
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Title card (non-interactive)
            VStack(spacing: 0) {
                Text("streamscapes")
                    .font(.custom("SpaceGrotesk-Light", size: 48))
                    .tracking(-2)
                    .foregroundStyle(Theme.textPrimary)

                Spacer().frame(height: 56)

                Text("LISTEN IN")
                    .font(.custom("DMSans-Regular", size: 13))
                    .tracking(3)
                    .foregroundStyle(Theme.textWhisper)
            }
            .allowsHitTesting(false)
        }
    }
}
