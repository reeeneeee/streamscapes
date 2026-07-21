import WatchConnectivity
import Foundation

/// Sends the auth token to a paired Apple Watch via WatchConnectivity.
/// Activated early in the app lifecycle; sends token on sign-in and
/// whenever the watch becomes reachable.
@MainActor
final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()
    private var session: WCSession?
    private var pendingToken: String?

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        self.session = session
    }

    func sendToken(_ token: String?) {
        pendingToken = token
        guard let session, session.activationState == .activated else { return }
        let message: [String: Any] = token != nil
            ? ["apiKey": token!, "endpoint": "https://www.streamscapes.fm"]
            : ["signedOut": true]
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { error in
                print("[WatchSession] sendMessage error: \(error.localizedDescription)")
                // Fall back to application context
                try? session.updateApplicationContext(message)
            }
        } else {
            try? session.updateApplicationContext(message)
        }
    }
}

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        Task { @MainActor in
            // Send pending token if we have one
            if let token = self.pendingToken {
                self.sendToken(token)
            }
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in
            if let token = self.pendingToken {
                self.sendToken(token)
            }
        }
    }
}
