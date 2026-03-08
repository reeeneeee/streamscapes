import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var store
    @Environment(AudioCoordinator.self) private var coordinator

    var body: some View {
        Group {
            if store.isPlaying {
                MainView()
            } else {
                StartView()
            }
        }
        .onChange(of: store.isPlaying) { _, playing in
            if playing {
                coordinator.start(store: store)
            } else {
                coordinator.stop(store: store)
            }
        }
        .onChange(of: store.global.masterVolume) { _, _ in
            coordinator.reconcile(store: store)
        }
    }
}
