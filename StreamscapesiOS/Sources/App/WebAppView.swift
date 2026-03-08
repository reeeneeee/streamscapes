import SwiftUI
import WebKit
import AVFoundation

struct WebAppView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        // Ensure audio session is active before creating WKWebView
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView

        // Native tap to force-resume audio
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap))
        tap.delegate = context.coordinator
        webView.addGestureRecognizer(tap)

        // Resume audio when app returns to foreground (early signal)
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.resumeAudio),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
        // Also try when app is fully active (later signal, web process more likely awake)
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.resumeAudio),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, UIGestureRecognizerDelegate {
        weak var webView: WKWebView?

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @objc func handleTap() {
            resumeAudio()
        }

        @objc func resumeAudio() {
            // Re-activate native audio session
            let session = AVAudioSession.sharedInstance()
            try? session.setActive(true)

            // Retry multiple times — WKWebView web process takes time to wake up
            let delays: [Double] = [0.0, 0.3, 0.8, 1.5, 3.0]
            for delay in delays {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                    self?.webView?.evaluateJavaScript("""
                        (function() {
                            if (window.Tone) {
                                Tone.start();
                                try { Tone.getContext().rawContext.resume(); } catch(e) {}
                                var t = Tone.getTransport();
                                if (t.state !== 'started') t.start();
                            }
                        })();
                    """) { _, _ in }
                }
            }

            // Fallback: if Tone context is still not running after retries, trigger app's start control.
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) { [weak self] in
                guard let self, let webView = self.webView else { return }
                webView.evaluateJavaScript("""
                    (function() {
                        try {
                            if (window.Tone && Tone.getContext().rawContext.state === 'running') return 'running';
                            var startBtn = Array.from(document.querySelectorAll('button')).find(function(btn){
                                var t = (btn.textContent || '').toLowerCase();
                                return t.indexOf('start listening') !== -1 || t.indexOf('start synth') !== -1;
                            });
                            if (startBtn) {
                                startBtn.click();
                                return 'clicked-start';
                            }
                            return 'not-running';
                        } catch (e) {
                            return 'error';
                        }
                    })();
                """) { _, _ in }
            }
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            return true
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.targetFrame == nil,
               let url = navigationAction.request.url {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
