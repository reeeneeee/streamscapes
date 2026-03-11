import Foundation
import Observation

@MainActor
@Observable
final class AudioCoordinator {
    private let bridge = WebAudioBridge()
    private let streamManager = StreamManager()
    private var reconcileTask: Task<Void, Never>?
    let visualizerData = VisualizerData()

    /// Call early (e.g. on app launch) to preload the WKWebView.
    /// The WKWebView is shown as a transparent overlay to capture the user's tap.
    func preload() {
        bridge.preload()
    }

    private var location: LocationManager?

    /// Set up the bridge and wait for the user's tap to unlock audio.
    func start(store: AppStore, location: LocationManager) {
        self.location = location
        print("[Audio] Setting up bridge, waiting for audio unlock from user tap...")

        bridge.start(store: store) { [weak self] in
            guard let self else { return }
            print("[Audio] Audio unlocked! Starting streams...")
            store.setPlaying(true)
            self.visualizerData.startAging()
            self.startStreams(store: store)
        }
    }

    private func startStreams(store: AppStore) {
        let lat = location?.latitude ?? 40.6681
        let lon = location?.longitude ?? -73.9822
        print("[Audio] Starting streams at \(lat), \(lon)")

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
        bridge.stop()
        visualizerData.stopAging()
        for id in store.channels.keys {
            store.setStreamState(id, nil)
        }
    }

    func reconcile(store: AppStore) {
        bridge.reconcile(channels: store.channels, global: store.global)
    }

    private var flightBuffer: [DataPoint] = []

    private func handleData(_ dp: DataPoint, store: AppStore) {
        guard store.channels[dp.streamId] != nil else { return }
        bridge.handleDataPoint(dp)

        // Feed visualizer + weather display
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
        case "weather":
            if let feelsLike = dp.fields["feelsLike"],
               let clouds = dp.fields["clouds"] {
                store.weatherDisplay = .init(feelsLike: feelsLike, clouds: clouds)
            }
        case "wikipedia":
            visualizerData.addWikiEdit(from: dp)
        default:
            break
        }
    }
}
