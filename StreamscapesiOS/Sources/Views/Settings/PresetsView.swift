import SwiftUI

struct PresetsView: View {
    @Environment(AppStore.self) private var store

    private let presets = [
        ("Default", "Balanced mix of all streams"),
        ("Weather Focus", "Solo weather with ambient mapping"),
        ("Night Flight", "Flights drone with deep reverb"),
        ("Wiki Pulse", "Wikipedia events as rhythmic pings"),
        ("Minimal", "Sparse, quiet observation"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 2) {
                ForEach(presets, id: \.0) { name, description in
                    Button {
                        // Preset loading would go here
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(name)
                                    .font(.custom("DMSans-Medium", size: 14))
                                    .foregroundStyle(Theme.textPrimary)
                                Text(description)
                                    .font(.custom("DMSans-Regular", size: 12))
                                    .foregroundStyle(Theme.textMuted)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.025))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Presets")
                    .font(.custom("SpaceGrotesk-Medium", size: 15))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .toolbarBackground(Theme.bgPrimary, for: .navigationBar)
    }
}
