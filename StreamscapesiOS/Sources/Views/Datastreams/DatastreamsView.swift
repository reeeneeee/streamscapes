import SwiftUI

struct DatastreamsView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text("streamscapes")
                    .font(.custom("SpaceGrotesk-Light", size: 15))
                    .foregroundStyle(Theme.textSecondary)
                    .padding(.top, 8)
                    .padding(.bottom, 16)

                MixerView()

                // Forward notifications hint
                VStack(spacing: 6) {
                    Text("Forward chrome and macOS system notifications".uppercased())
                        .font(.custom("SpaceGrotesk-Medium", size: 10))
                        .tracking(1)
                        .foregroundStyle(Theme.textWhisper)
                    Text("Set up the Chrome extension and menu bar app at streamscapes.fm on desktop.")
                        .font(.custom("DMSans-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 20)
            }
        }
        .scrollIndicators(.hidden)
    }
}
