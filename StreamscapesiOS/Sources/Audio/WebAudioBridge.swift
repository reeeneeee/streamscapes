import Foundation
import WebKit
import AVFoundation

/// Forwards JS console.log/error/warn to Xcode console.
private final class JSConsoleHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let text = message.body as? String {
            print("[WebAudioBridge:JS] \(text)")
        }
    }
}

/// Receives "audioUnlocked" message from the HTML tap handler.
@MainActor
private final class AudioUnlockHandler: NSObject, WKScriptMessageHandler {
    var onUnlock: (() -> Void)?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        print("[WebAudioBridge] Audio unlocked by user gesture!")
        onUnlock?()
    }
}

/// Runs the web Tone.js AudioEngine inside a hidden WKWebView.
/// Replaces the native AudioKit SonificationEngine with 100% web parity.
///
/// Audio unlock flow:
/// 1. WKWebView starts full-screen + transparent, overlaying the SwiftUI start screen
/// 2. User taps "PLUG IN" — the tap hits the WKWebView's HTML tap handler
/// 3. The HTML handler creates an AudioContext inside the real gesture (required by iOS)
/// 4. The handler calls AudioBridge.unlockWithContext() and notifies Swift
/// 5. Swift shrinks the WKWebView to 1x1, initializes the engine, and starts streams
@MainActor
final class WebAudioBridge: NSObject {
    private var webView: WKWebView?
    private var isReady = false
    private var pendingCalls: [String] = []
    private let consoleHandler = JSConsoleHandler()
    private let unlockHandler = AudioUnlockHandler()
    private var onAudioUnlocked: (() -> Void)?

    // MARK: - Setup

    /// Load the WKWebView as a full-screen transparent overlay.
    /// Call this early (before the user taps) so the page is loaded and ready.
    func preload() {
        guard webView == nil else { return }

        // WKWebView config — no user gesture required for media (belt-and-suspenders)
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // JS console forwarding → Xcode console
        let contentController = config.userContentController
        contentController.add(consoleHandler, name: "jsConsole")
        contentController.add(unlockHandler, name: "audioUnlocked")

        let consoleScript = WKUserScript(source: """
        (function() {
            var orig = { log: console.log.bind(console), error: console.error.bind(console), warn: console.warn.bind(console) };
            function send(level, args) {
                try {
                    window.webkit.messageHandlers.jsConsole.postMessage(
                        level + ': ' + Array.prototype.map.call(args, function(a) {
                            if (a instanceof Error) return a.message;
                            if (typeof a === 'object') try { return JSON.stringify(a); } catch(e) { return String(a); }
                            return String(a);
                        }).join(' ')
                    );
                } catch(e) {}
            }
            console.log = function() { send('LOG', arguments); orig.log.apply(console, arguments); };
            console.error = function() { send('ERR', arguments); orig.error.apply(console, arguments); };
            console.warn = function() { send('WRN', arguments); orig.warn.apply(console, arguments); };
            window.onerror = function(msg, src, line, col, err) {
                send('ERR', ['Uncaught: ' + msg + ' at ' + src + ':' + line + ':' + col]);
            };
            window.onunhandledrejection = function(e) {
                send('ERR', ['Unhandled rejection: ' + (e.reason || e)]);
            };
        })();
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        contentController.addUserScript(consoleScript)

        // Start full-screen so it can capture the user's tap
        let screenBounds = UIScreen.main.bounds
        let wv = WKWebView(frame: screenBounds, configuration: config)
        wv.isInspectable = true
        wv.navigationDelegate = self
        wv.backgroundColor = .clear
        wv.isOpaque = false
        wv.scrollView.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false
        self.webView = wv

        // Add to key window as overlay
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first {
            window.addSubview(wv)
            print("[WebAudioBridge] WKWebView added as full-screen overlay")
        }

        // Load HTML from bundle
        guard let htmlURL = Bundle.main.url(forResource: "audio-bridge", withExtension: "html") else {
            print("[WebAudioBridge] audio-bridge.html not found in bundle")
            return
        }
        wv.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())

        print("[WebAudioBridge] Preloading audio bridge...")
    }

    /// Set up the unlock callback. When the user taps the WKWebView overlay,
    /// the audio context is unlocked, then this initializes the engine and calls back.
    func start(store: AppStore, onAudioUnlocked: @escaping () -> Void) {
        self.onAudioUnlocked = onAudioUnlocked

        // Set up unlock callback — fires when the HTML tap handler posts a message
        unlockHandler.onUnlock = { [weak self] in
            guard let self else { return }

            // Set up AVAudioSession now that the user has interacted
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try? session.setActive(true)

            // Shrink WKWebView — no longer needs to capture taps
            self.webView?.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
            self.webView?.isUserInteractionEnabled = false
            print("[WebAudioBridge] WKWebView shrunk to 1x1 after unlock")

            // Initialize the engine now that audio context is unlocked
            self.initialize(store: store)

            // Notify coordinator that audio is ready
            self.onAudioUnlocked?()
        }

        print("[WebAudioBridge] Waiting for user tap to unlock audio...")
    }

    func stop() {
        callJS("AudioBridge.stop()")
        if let wv = webView {
            wv.configuration.userContentController.removeScriptMessageHandler(forName: "jsConsole")
            wv.configuration.userContentController.removeScriptMessageHandler(forName: "audioUnlocked")
            wv.removeFromSuperview()
        }
        webView?.stopLoading()
        webView = nil
        isReady = false
        pendingCalls.removeAll()
        onAudioUnlocked = nil
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Engine interface

    private func initialize(store: AppStore) {
        let channelsJson = encodeChannels(store.channels)
        let globalJson = encodeGlobal(store.global)
        print("[WebAudioBridge] Initializing with \(store.channels.count) channels")
        callJS("AudioBridge.init(\(quote(channelsJson)), \(quote(globalJson)))")

        // Check status after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.callJS("AudioBridge.status()")
        }

        // Listen for interruptions
        let session = AVAudioSession.sharedInstance()
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

        let logJs = js.count > 120 ? String(js.prefix(120)) + "..." : js
        print("[WebAudioBridge] callJS: \(logJs)")

        wv.evaluateJavaScript(js) { result, error in
            if let error {
                print("[WebAudioBridge] JS error: \(error.localizedDescription)")
            }
            if let result {
                print("[WebAudioBridge] JS result: \(result)")
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

        dict["effects"] = c.effects.map { e -> [String: Any] in
            [
                "type": e.type,
                "wet": e.wet,
                "bypass": e.bypass,
                "params": e.params,
            ]
        }

        dict["behaviorType"] = c.behaviorType.rawValue
        dict["ambientMode"] = c.ambientMode.rawValue

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

    private func quote(_ json: String) -> String {
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
            print("[WebAudioBridge] Page loaded, bridge ready — waiting for user tap")
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
