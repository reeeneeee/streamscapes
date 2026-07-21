import SwiftUI

@main
struct StreamscapesWatchApp: App {
    @State private var viewModel = WatchViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(viewModel)
        }
    }
}
