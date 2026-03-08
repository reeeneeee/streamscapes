import Foundation
import WebKit
import AVFoundation

/// Runs the web Tone.js AudioEngine inside a hidden WKWebView.
/// Replaces the native AudioKit SonificationEngine with 100% web parity.
@MainActor
final class WebAudioBridge: NSObject {
    private var webView: WKWebView?
    private var isReady = false
    private var pendingCalls: [String] = []

    // MARK: - Setup

    func start(store: AppStore) {
        guard webView == nil else { return }

        // Audio session
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)

        // WKWebView config — no user gesture required for audio
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        wv.navigationDelegate = self
        self.webView = wv

        // Load HTML from bundle
        guard let htmlURL = Bundle.main.url(forResource: "audio-bridge", withExtension: "html") else {
            print("[WebAudioBridge] audio-bridge.html not found in bundle")
            return
        }
        // Load with access to the directory so the JS file can be found
        wv.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())

        // Listen for interruptions
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsValue = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
            Task { @MainActor in
                self?.handleInterruption(typeValue: typeValue, optionsValue: optionsValue)
            }
        }

        // Listen for app foreground
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.resumeAudio()
            }
        }

        print("[WebAudioBridge] Loading audio bridge...")
    }

    func stop() {
        callJS("AudioBridge.stop()")
        webView?.stopLoading()
        webView = nil
        isReady = false
        pendingCalls.removeAll()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Engine interface

    func initialize(store: AppStore) {
        let channelsJson = encodeChannels(store.channels)
        let globalJson = encodeGlobal(store.global)
        callJS("AudioBridge.init(\(quote(channelsJson)), \(quote(globalJson)))")
    }

    func reconcile(channels: [String: ChannelConfig], global: GlobalConfig) {
        let channelsJson = encodeChannels(channels)
        let globalJson = encodeGlobal(global)
        callJS("AudioBridge.reconcile(\(quote(channelsJson)), \(quote(globalJson)))")
    }

    func handleDataPoint(_ dp: DataPoint) {
        let dpJson = encodeDataPoint(dp)
        callJS("AudioBridge.handleDataPoint(\(quote(dpJson)))")
    }

    // MARK: - Audio session

    private func handleInterruption(typeValue: UInt?, optionsValue: UInt?) {
        guard let typeValue,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        if type == .ended {
            let options = optionsValue.flatMap { AVAudioSession.InterruptionOptions(rawValue: $0) }
            if options?.contains(.shouldResume) == true {
                resumeAudio()
            }
        }
    }

    private func resumeAudio() {
        try? AVAudioSession.sharedInstance().setActive(true)
        callJS("AudioBridge.resume()")
    }

    // MARK: - JS bridge

    private func callJS(_ js: String) {
        guard let wv = webView else { return }

        if !isReady {
            pendingCalls.append(js)
            return
        }

        wv.evaluateJavaScript(js) { result, error in
            if let error {
                print("[WebAudioBridge] JS error: \(error.localizedDescription)")
            }
            if let result = result as? String, result.hasPrefix("error:") {
                print("[WebAudioBridge] Bridge error: \(result)")
            }
        }
    }

    private func flushPendingCalls() {
        let calls = pendingCalls
        pendingCalls.removeAll()
        for js in calls {
            callJS(js)
        }
    }

    // MARK: - JSON encoding

    private func encodeChannels(_ channels: [String: ChannelConfig]) -> String {
        var dict: [String: Any] = [:]
        for (id, config) in channels {
            dict[id] = channelConfigToDict(config)
        }
        return jsonString(dict)
    }

    private func encodeGlobal(_ global: GlobalConfig) -> String {
        let dict: [String: Any] = [
            "rootNote": global.rootNote,
            "scale": global.scale,
            "tempo": global.tempo,
            "masterVolume": global.masterVolume,
        ]
        return jsonString(dict)
    }

    private func encodeDataPoint(_ dp: DataPoint) -> String {
        var fields: [String: Any] = [:]
        for (key, value) in dp.fields {
            fields[key] = value
        }
        // Also include metadata as string fields (web DataPoint supports string fields)
        for (key, value) in dp.metadata {
            fields[key] = value
        }
        let dict: [String: Any] = [
            "streamId": dp.streamId,
            "timestamp": dp.timestamp.timeIntervalSince1970 * 1000,
            "fields": fields,
        ]
        return jsonString(dict)
    }

    private func channelConfigToDict(_ c: ChannelConfig) -> [String: Any] {
        var dict: [String: Any] = [
            "streamId": c.streamId,
            "enabled": c.enabled,
            "mode": c.mode,
            "synthType": c.synthType,
            "volume": c.volume,
            "pan": c.pan,
            "mute": c.mute,
            "solo": c.solo,
        ]

        // synthOptions
        var synthOpts: [String: Any] = [:]
        if let env = c.synthOptions.envelope {
            synthOpts["envelope"] = [
                "attack": env.attack,
                "decay": env.decay,
                "sustain": env.sustain,
                "release": env.release,
            ]
        }
        if let osc = c.synthOptions.oscillatorType {
            synthOpts["oscillator"] = ["type": osc]
        }
        dict["synthOptions"] = synthOpts

        // mappings
        dict["mappings"] = c.mappings.map { m -> [String: Any] in
            var md: [String: Any] = [
                "sourceField": m.sourceField,
                "targetParam": m.targetParam,
                "curve": curveToWeb(m.curve),
                "inputRange": m.inputRange,
                "outputRange": m.outputRange,
                "invert": m.invert,
            ]
            if let v = m.smoothingMs { md["smoothingMs"] = v }
            if let v = m.quantizeStep { md["quantizeStep"] = v }
            if let v = m.hysteresis { md["hysteresis"] = v }
            return md
        }

        // effects
        dict["effects"] = c.effects.map { e -> [String: Any] in
            [
                "type": e.type,
                "wet": e.wet,
                "bypass": e.bypass,
                "params": e.params,
            ]
        }

        // non-optional enums
        dict["behaviorType"] = c.behaviorType.rawValue
        dict["ambientMode"] = c.ambientMode.rawValue

        // optional fields — only include if set
        if let v = c.eventCooldownMs { dict["eventCooldownMs"] = v }
        if let v = c.eventTriggerThreshold { dict["eventTriggerThreshold"] = v }
        if let v = c.eventBurstCap { dict["eventBurstCap"] = v }
        if let v = c.eventBurstWindowMs { dict["eventBurstWindowMs"] = v }
        if let v = c.eventArticulation { dict["eventArticulation"] = v.rawValue }
        if let v = c.smoothingMs { dict["smoothingMs"] = v }
        if let v = c.preMapWindow { dict["preMapWindow"] = v }
        if let v = c.preMapStatistic { dict["preMapStatistic"] = v.rawValue }
        if let v = c.preMapChangeThreshold { dict["preMapChangeThreshold"] = v }
        if let v = c.preMapDerivative { dict["preMapDerivative"] = v }
        if let v = c.preMapPercentileClamp { dict["preMapPercentileClamp"] = v }
        if let v = c.alertTier { dict["alertTier"] = v.rawValue }
        if let v = c.beaconThreshold { dict["beaconThreshold"] = v }
        if let v = c.beaconPeriodicSec { dict["beaconPeriodicSec"] = v }
        if let v = c.beaconOnExtrema { dict["beaconOnExtrema"] = v }
        if let v = c.hybridAccent { dict["hybridAccent"] = v }
        if let v = c.sampleSource { dict["sampleSource"] = v }
        if let v = c.samplePlaybackRateMin { dict["samplePlaybackRateMin"] = v }
        if let v = c.samplePlaybackRateMax { dict["samplePlaybackRateMax"] = v }
        if let v = c.sampleDensity { dict["sampleDensity"] = v }
        if let v = c.sampleFilterCutoff { dict["sampleFilterCutoff"] = v }
        if let v = c.sampleReverbSend { dict["sampleReverbSend"] = v }
        if let v = c.entityField { dict["entityField"] = v }
        if let v = c.patternType { dict["patternType"] = v }

        return dict
    }

    private func curveToWeb(_ curve: SonificationMapping.CurveType) -> String {
        switch curve {
        case .linear: return "linear"
        case .log: return "logarithmic"
        case .exp: return "exponential"
        case .step: return "step"
        }
    }

    /// Escape a JSON string for embedding as a JS string argument.
    private func quote(_ json: String) -> String {
        // Wrap in single quotes, escaping internal single quotes and backslashes
        let escaped = json
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        return "'\(escaped)'"
    }

    private func jsonString(_ dict: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
              let str = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return str
    }
}

// MARK: - WKNavigationDelegate

extension WebAudioBridge: WKNavigationDelegate {
    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            print("[WebAudioBridge] Page loaded, bridge ready")
            self.isReady = true
            self.flushPendingCalls()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[WebAudioBridge] Navigation failed: \(error.localizedDescription)")
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("[WebAudioBridge] Provisional navigation failed: \(error.localizedDescription)")
    }
}
