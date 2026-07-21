import AVFoundation
import Foundation
import MediaPlayer
import Observation
import UIKit

@MainActor
@Observable
final class AudioCoordinator {
    private let bridge = WebAudioBridge()
    private let streamManager = StreamManager()
    private var reconcileTask: Task<Void, Never>?
    let visualizerData = VisualizerData()

    /// RMS levels (0-1) for each channel, polled from JS at ~10fps.
    var channelLevels: [String: Double] = [:]

    /// Last metric display string per stream (e.g. "72°", "45%", "reddit.com").
    var metricValues: [String: String] = [:]

    private static let displayFields: [String: (field: String, unit: String)] = [
        "weather:temp": ("feelsLike", "°"),
        "weather:clouds": ("clouds", "%"),
        "flights": ("nearbyCount", ""),
        "wikipedia": ("title", ""),
        "archive": ("title", ""),
        "rss": ("title", ""),
        "stocks": ("price", "$"),
    ]

    private static func displayField(for streamId: String) -> (field: String, unit: String)? {
        if let f = displayFields[streamId] { return f }
        if streamId.hasPrefix("system:") { return ("percent", "%") }
        if streamId == "watch:heartRate" { return ("bpm", " BPM") }
        if streamId == "watch:steps" { return ("totalSteps", "") }
        if streamId.hasPrefix("dd:") { return ("durationMs", "ms") }
        if streamId.hasPrefix("otlp:") { return ("durationMs", "ms") }
        if streamId.hasPrefix("notify:") { return ("spanName", "") }
        if streamId.hasPrefix("chrome:") { return ("spanName", "") }
        return nil
    }

    private func updateMetric(_ dp: DataPoint) {
        guard let display = Self.displayField(for: dp.streamId) else { return }
        let raw: Any?
        if let v = dp.fields[display.field] {
            raw = v
        } else if let v = dp.metadata[display.field] {
            raw = v
        } else {
            return
        }
        let formatted: String
        if let num = raw as? Double {
            let str = num == num.rounded() ? String(Int(num)) : String(format: "%.1f", num)
            formatted = display.unit == "$" ? "$\(str)" : "\(str)\(display.unit)"
        } else if let str = raw as? String, !str.isEmpty {
            formatted = str.count > 18 ? String(str.prefix(18)) + "…" : str
        } else {
            return
        }
        metricValues[dp.streamId] = formatted
    }

    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

    /// Call early (e.g. on app launch) to preload the WKWebView.
    /// The WKWebView is shown as a transparent overlay to capture the user's tap.
    func preload() {
        bridge.preload()
    }

    private var location: LocationManager?

    private var authManager: AuthManager?

    /// Set up the bridge and wait for the user's tap to unlock audio.
    func start(store: AppStore, location: LocationManager, authManager: AuthManager) {
        self.location = location
        self.authManager = authManager
        print("[Audio] Setting up bridge, waiting for audio unlock from user tap...")

        bridge.onLevelsUpdated = { [weak self] levels in
            self?.channelLevels = levels
        }

        bridge.start(store: store) { [weak self] in
            guard let self else { return }
            print("[Audio] Audio unlocked! Starting streams...")
            store.setPlaying(true)
            self.visualizerData.startAging()
            self.setupNowPlaying()
            self.startStreams(store: store, authManager: authManager)
        }
    }

    private func startStreams(store: AppStore, authManager: AuthManager? = nil) {
        let lat = location?.latitude ?? 40.6681
        let lon = location?.longitude ?? -73.9822
        print("[Audio] Starting streams at \(lat), \(lon)")

        var plugins: [any StreamPlugin] = [
            WeatherStreamPlugin(
                lat: lat, lon: lon,
                apiKey: Secrets.weatherAPIKey
            ),
            FlightStreamPlugin(lat: lat, lon: lon),
            WikiStreamPlugin(),
            ArchiveStreamPlugin(),
            {
                nonisolated(unsafe) let s = store
                return StockStreamPlugin(getSymbols: { await MainActor.run { s.stockSymbols } })
            }(),
            {
                nonisolated(unsafe) let s = store
                return RSSStreamPlugin(getFeeds: { await MainActor.run { s.rssFeeds } })
            }(),
        ]

        // Add ingest stream if user is signed in
        if let token = authManager?.token {
            print("[Audio] Ingest stream connecting with token: \(token.prefix(20))...")
            plugins.append(IngestStreamPlugin(
                token: token,
                baseURL: "https://www.streamscapes.fm"
            ))
        } else {
            print("[Audio] No auth token — skipping ingest stream")
        }

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

    // MARK: - Background audio (Phase 1)

    /// Set up lock screen / Control Center controls — signals to iOS this is a media app.
    private func setupNowPlaying() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.bridge.resume()
            try? AVAudioSession.sharedInstance().setActive(true)
            return .success
        }
        commandCenter.pauseCommand.addTarget { _ in .success }
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.bridge.resume()
            return .success
        }

        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = "streamscapes"
        info[MPMediaItemPropertyArtist] = "live data sonification"
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        print("[Audio] Now Playing info configured for lock screen")
    }

    /// Call when app enters background — begins background task + ensures audio keeps running.
    func enterBackground() {
        guard backgroundTaskID == .invalid else { return }
        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "StreamscapesAudio") { [weak self] in
            self?.endBackgroundTask()
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        bridge.ensureBackgroundAudio()
        print("[Audio] Entered background, background task started")
    }

    /// Call when app returns to foreground.
    func enterForeground() {
        endBackgroundTask()
        try? AVAudioSession.sharedInstance().setActive(true)
        bridge.resume()
        print("[Audio] Entered foreground, audio resumed")
    }

    private func endBackgroundTask() {
        if backgroundTaskID != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskID)
            backgroundTaskID = .invalid
        }
    }

    func stop(store: AppStore) {
        endBackgroundTask()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        Task { await streamManager.stopAll() }
        bridge.stop()
        channelLevels = [:]
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
        // Weather plugin sends streamId "weather" — fan out to sub-channels
        if dp.streamId == "weather" {
            // Send to weather:temp sub-channel
            if store.channels["weather:temp"] != nil {
                let tempDp = DataPoint(streamId: "weather:temp", timestamp: dp.timestamp, fields: dp.fields, metadata: dp.metadata)
                bridge.handleDataPoint(tempDp)
                updateMetric(tempDp)
            }
            // Send to weather:clouds sub-channel
            if store.channels["weather:clouds"] != nil {
                let cloudsDp = DataPoint(streamId: "weather:clouds", timestamp: dp.timestamp, fields: dp.fields, metadata: dp.metadata)
                bridge.handleDataPoint(cloudsDp)
                updateMetric(cloudsDp)
            }
            // Update weather display
            if let feelsLike = dp.fields["feelsLike"],
               let clouds = dp.fields["clouds"] {
                store.weatherDisplay = .init(feelsLike: feelsLike, clouds: clouds)
            }
            return
        }

        // Auto-create channel for unknown ingest sub-channels (dd:*, otlp:*, system:*, chrome:*, etc.)
        if store.channels[dp.streamId] == nil {
            let colonIdx = dp.streamId.firstIndex(of: ":")
            guard let colonIdx, colonIdx > dp.streamId.startIndex else { return }
            let prefix = String(dp.streamId[..<colonIdx])
            let subCount = store.channels.values.filter { $0.parentPluginId != nil }.count
            guard subCount < 24 else { return }
            let serviceName = String(dp.streamId[dp.streamId.index(after: colonIdx)...])
            print("[Audio] Auto-creating channel: \(dp.streamId)")
            let config: ChannelConfig
            if prefix == "system" {
                config = AppStore.makeSystemSubChannel(streamId: dp.streamId, metricName: serviceName)
            } else if prefix == "chrome" {
                config = AppStore.makeBrowserSubChannel(streamId: dp.streamId, serviceName: serviceName)
            } else if prefix == "watch" {
                config = AppStore.makeWatchSubChannel(streamId: dp.streamId, metricName: serviceName)
            } else {
                config = AppStore.makeOtlpSubChannel(streamId: dp.streamId, serviceName: serviceName)
            }
            store.addChannel(config)
        }
        guard store.channels[dp.streamId]?.enabled == true else { return }
        bridge.handleDataPoint(dp)
        updateMetric(dp)

        // Feed visualizer
        let streamId = dp.streamId
        if streamId == "flights" {
            flightBuffer.append(dp)
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(100))
                if !self.flightBuffer.isEmpty {
                    self.visualizerData.updateFlights(from: self.flightBuffer)
                    self.flightBuffer.removeAll()
                }
            }
        } else if streamId == "wikipedia" {
            visualizerData.addWikiEdit(from: dp)
        } else if streamId == "archive" {
            visualizerData.addIngestDrop(from: dp)
        } else if streamId.hasPrefix("dd:") || streamId.hasPrefix("notify:") || streamId.hasPrefix("otlp:") || streamId.hasPrefix("github:") || streamId.hasPrefix("system:") || streamId.hasPrefix("chrome:") || streamId.hasPrefix("watch:") {
            visualizerData.addIngestDrop(from: dp)
        }
    }
}
