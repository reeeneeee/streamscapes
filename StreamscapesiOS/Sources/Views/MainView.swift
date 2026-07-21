import SwiftUI

enum AppTab: String, CaseIterable {
    case main = "Main"
    case datastreams = "Inputs"
    case configure = "Sonifications"
}

struct MainView: View {
    @Environment(AppStore.self) private var store
    @Environment(LocationManager.self) private var location
    @State private var selectedTab: AppTab = .main

    var body: some View {
        ZStack {
            Theme.bgPrimary.ignoresSafeArea()
            AtmosphereBackground()

            VStack(spacing: 0) {
                // Location fallback banner
                if location.denied && !location.bannerDismissed, let label = location.randomAirportLabel {
                    HStack(spacing: 8) {
                        Text("Dropped you near **\(label)**. Enable location for local flights & weather.")
                            .font(.custom("DMSans-Regular", size: 12))
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(2)
                        Spacer(minLength: 0)
                        Button { location.dismissBanner() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.textMuted.opacity(0.5))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
                }

                // Weather status + tab bar
                if let weather = store.weatherDisplay {
                    Text("\(String(format: "%.2f", location.latitude)), \(String(format: "%.2f", location.longitude)) · \(Int(weather.feelsLike))°F · \(Int(weather.clouds))% cloud cover")
                        .font(.custom("SpaceGrotesk-Regular", size: 11))
                        .foregroundStyle(Theme.textMuted)
                        .tracking(0.3)
                        .padding(.top, 6)
                }

                tabBar

                // Content
                switch selectedTab {
                case .main:
                    ListenView()
                case .datastreams:
                    DatastreamsView()
                case .configure:
                    ConfigureView()
                }

                // Transport bar
                TransportBarView()
            }
        }
    }

    private var tabBar: some View {
        HStack {
            Spacer()
            HStack(spacing: 4) {
                ForEach(AppTab.allCases, id: \.self) { tab in
                    Button {
                        selectedTab = tab
                    } label: {
                        Text(tab.rawValue)
                            .font(.custom("DMSans-Medium", size: 13))
                            .foregroundStyle(selectedTab == tab ? Theme.textPrimary : Theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 7)
                            .background(selectedTab == tab ? Color.white.opacity(0.1) : .clear)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            .padding(3)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            Spacer()
        }
        .padding(.top, 4)
        .padding(.bottom, 4)
    }
}
