import Foundation
import Observation

@MainActor
@Observable
final class AudioCoordinator {
    private let engine = SonificationEngine()
    private let streamManager = StreamManager()
    private var reconcileTask: Task<Void, Never>?
    let visualizerData = VisualizerData()

    func start(store: AppStore) {
        print("[Audio] Starting engine...")
        do {
            try engine.start()
            print("[Audio] Engine started OK")
        } catch {
            print("[Audio] Engine start FAILED: \(error)")
            return
        }

        engine.reconcile(store: store)
        print("[Audio] Reconciled \(store.channels.filter { $0.value.enabled && !$0.value.mute }.count) active channels")
        visualizerData.startAging()

        let lat = 37.7749
        let lon = -122.4194

        let plugins: [any StreamPlugin] = [
            WeatherStreamPlugin(
                lat: lat, lon: lon,
                apiKey: Secrets.weatherAPIKey
            ),
            FlightStreamPlugin(
                lat: lat, lon: lon,
                apiKey: Secrets.flightRadarAPIKey
            ),
            WikiStreamPlugin(),
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
