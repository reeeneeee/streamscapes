import SwiftUI

struct StartView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            Theme.bgPrimary.ignoresSafeArea()

            // Atmosphere blobs
            AtmosphereBackground()

            // Title card
            VStack(spacing: 0) {
                Text("streamscapes")
                    .font(.custom("SpaceGrotesk-Light", size: 48))
                    .tracking(-2)
                    .foregroundStyle(Theme.textPrimary)

                Spacer().frame(height: 56)

                Text("PLUG IN")
                    .font(.custom("DMSans-Regular", size: 13))
                    .tracking(3)
                    .foregroundStyle(Theme.textWhisper)
            }
        }
        .onTapGesture {
            store.setPlaying(true)
        }
    }
}
