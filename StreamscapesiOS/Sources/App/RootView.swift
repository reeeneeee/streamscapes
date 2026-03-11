import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var store
    @Environment(AudioCoordinator.self) private var coordinator
    @Environment(LocationManager.self) private var location

    var body: some View {
        Group {
            if store.isPlaying {
                MainView()
            } else {
                StartView()
            }
        }
        .onAppear {
            location.requestLocation()
            coordinator.preload()
            coordinator.start(store: store, location: location)
        }
        .onChange(of: store.isPlaying) { _, playing in
            if !playing {
                coordinator.stop(store: store)
            }
        }
    }
}
