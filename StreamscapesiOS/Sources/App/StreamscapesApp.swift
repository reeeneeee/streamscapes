import SwiftUI

@main
struct StreamscapesApp: App {
    @State private var store = AppStore()
    @State private var coordinator = AudioCoordinator()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(coordinator)
                .preferredColorScheme(.dark)
        }
    }
}
