import SwiftUI

enum SettingsDestination: Hashable {
    case presets
    case sonification
    case mappings
    case effects
}

struct ControlsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Text("streamscapes")
                        .font(.custom("SpaceGrotesk-Light", size: 15))
                        .foregroundStyle(Theme.textSecondary)
                        .padding(.top, 8)
                        .padding(.bottom, 16)

                    MixerView()

                    VStack(spacing: 1) {
                        NavigationLink(value: SettingsDestination.presets) {
                            SettingsRow(number: "01", title: "Presets")
                        }
                        NavigationLink(value: SettingsDestination.sonification) {
                            SettingsRow(number: "02", title: "Sonification")
                        }
                        NavigationLink(value: SettingsDestination.mappings) {
                            SettingsRow(number: "03", title: "Mappings")
                        }
                        NavigationLink(value: SettingsDestination.effects) {
                            SettingsRow(number: "04", title: "Effects")
                        }
                    }
                    .padding(.top, 16)
                    .padding(.horizontal, 16)
                }
            }
            .scrollIndicators(.hidden)
            .navigationDestination(for: SettingsDestination.self) { dest in
                switch dest {
                case .presets: PresetsView()
                case .sonification: SonificationView()
                case .mappings: MappingsView()
                case .effects: EffectsView()
                }
            }
        }
    }
}

struct SettingsRow: View {
    let number: String
    let title: String

    var body: some View {
        HStack {
            HStack(spacing: 10) {
                Text(number)
                    .font(.custom("DMSans-Regular", size: 10))
                    .tracking(1)
                    .foregroundStyle(Theme.textWhisper)

                Text(title)
                    .font(.custom("DMSans-Medium", size: 14))
                    .foregroundStyle(Theme.textSecondary.opacity(1.4))
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.textWhisper)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.02))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
