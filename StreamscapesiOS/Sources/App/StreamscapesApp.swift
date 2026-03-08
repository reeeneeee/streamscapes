import SwiftUI
import AVFoundation

@main
struct StreamscapesApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = AppStore()
    @State private var coordinator = AudioCoordinator()

    init() {
        Self.activateAudioSession()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(coordinator)
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
                .onAppear {
                    // Wire store mutations → engine reconciliation
                    store.onReconcileNeeded = { [weak store, weak coordinator] in
                        guard let store, let coordinator, store.isPlaying else { return }
                        coordinator.reconcile(store: store)
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        Self.activateAudioSession()
                        if store.isPlaying {
                            coordinator.reconcile(store: store)
                        }
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
