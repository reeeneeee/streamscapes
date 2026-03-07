import SwiftUI

enum AppTab: String, CaseIterable {
    case listen = "Listen"
    case controls = "Controls"
}

struct MainView: View {
    @Environment(AppStore.self) private var store
    @State private var selectedTab: AppTab = .listen

    var body: some View {
        ZStack {
            Theme.bgPrimary.ignoresSafeArea()
            AtmosphereBackground()

            VStack(spacing: 0) {
                // Content
                switch selectedTab {
                case .listen:
                    ListenView()
                case .controls:
                    ControlsView()
                }

                // Tab bar
                tabBar
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
                            .padding(.horizontal, 24)
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
        .padding(.top, 12)
        .padding(.bottom, 32)
        .background(Color(hex: 0x0D0D0D).opacity(0.9))
    }
}
