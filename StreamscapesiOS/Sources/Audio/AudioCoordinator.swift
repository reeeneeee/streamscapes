import Foundation
import Observation

@MainActor
@Observable
final class AudioCoordinator {
    private let engine = SonificationEngine()
    private let streamManager = StreamManager()
    private var reconcileTask: Task<Void, Never>?
    let visualizerData = VisualizerData()

    // Base URL for API calls (the web app dev server)
    var baseURL = URL(string: "http://localhost:3000")!

    func start(store: AppStore) {
        do {
            try engine.start()
        } catch {
            print("[AudioCoordinator] Engine start failed: \(error)")
            return
        }

        engine.reconcile(store: store)
        visualizerData.startAging()

        let lat = 37.7749
        let lon = -122.4194

        let plugins: [any StreamPlugin] = [
            WeatherStreamPlugin(baseURL: baseURL, lat: lat, lon: lon),
            FlightStreamPlugin(baseURL: baseURL, lat: lat, lon: lon),
            WikiStreamPlugin(baseURL: baseURL),
        ]

        for plugin in plugins {
            let pluginId = plugin.id
            store.setStreamState(pluginId, .connecting)
            Task {
                await streamManager.start(
                    plugin: plugin,
                    onData: { [weak self] dp in
                        self?.handleData(dp, store: store)
                    }
                )
                store.setStreamState(pluginId, .connected)
            }
        }
    }

    func stop(store: AppStore) {
        Task { await streamManager.stopAll() }
        engine.stop()
        visualizerData.stopAging()
        for id in store.channels.keys {
            store.setStreamState(id, nil)
        }
    }

    func reconcile(store: AppStore) {
        engine.reconcile(store: store)
    }

    private var flightBuffer: [DataPoint] = []

    private func handleData(_ dp: DataPoint, store: AppStore) {
        guard let config = store.channels[dp.streamId] else { return }
        engine.handleDataPoint(dp, config: config, global: store.global)

        // Feed visualizer
        switch dp.streamId {
        case "flights":
            flightBuffer.append(dp)
            // Batch update after all flights from one poll arrive (10s interval)
            // Use a simple debounce: update after short delay
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(100))
                if !self.flightBuffer.isEmpty {
                    self.visualizerData.updateFlights(from: self.flightBuffer)
                    self.flightBuffer.removeAll()
                }
            }
        case "wikipedia":
            visualizerData.addWikiEdit(from: dp)
        default:
            break
        }
    }
}
