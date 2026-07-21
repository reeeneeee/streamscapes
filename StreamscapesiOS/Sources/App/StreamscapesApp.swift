import SwiftUI
import AVFoundation

@main
struct StreamscapesApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = AppStore()
    @State private var coordinator = AudioCoordinator()
    @State private var location = LocationManager()
    @State private var authManager = AuthManager()

    init() {
        Self.activateAudioSession()
        WatchSessionManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(coordinator)
                .environment(location)
                .environment(authManager)
                .preferredColorScheme(.dark)
                .onAppear {
                    // Wire store mutations → engine reconciliation
                    store.onReconcileNeeded = { [weak store, weak coordinator] in
                        guard let store, let coordinator, store.isPlaying else { return }
                        coordinator.reconcile(store: store)
                    }
                    // Send existing auth token to paired Apple Watch
                    if let token = authManager.token {
                        WatchSessionManager.shared.sendToken(token)
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        Self.activateAudioSession()
                        if store.isPlaying {
                            coordinator.enterForeground()
                            coordinator.reconcile(store: store)
                        }
                    case .background:
                        if store.isPlaying {
                            coordinator.enterBackground()
                        }
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
        }
    }

    private static func activateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
    }
}
