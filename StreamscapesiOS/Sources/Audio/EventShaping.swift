import Foundation

/// Pure-function event shaping. Port of web's `event-shaping.ts`.
/// Controls when triggered notes actually fire (cooldown, burst cap, threshold).
/// No AudioKit dependencies — independently testable.
enum EventShaping {
    /// Per-stream state for event shaping decisions.
    struct StreamState {
        var lastTriggeredAtMs: Double?
        var eventHistory: [Double] = []
        var lastEventMetric: Double?
    }

    /// Extract a 0-1 metric from mapped params for threshold comparison.
    /// Matches web's `eventMetricFromParams`.
    static func eventMetric(from params: [String: Double]) -> Double? {
        if let velocity = params["velocity"] {
            return max(0, min(1, velocity))
        }
        if let scaleIndex = params["scaleIndex"] {
            return max(0, min(1, abs(scaleIndex) / 12))
        }
        if let frequency = params["frequency"] {
            let minF = 55.0, maxF = 1760.0
            let safe = max(minF, frequency)
            return max(0, min(1, log2(safe / minF) / log2(maxF / minF)))
        }
        return nil
    }

    /// Check if a note should be triggered based on cooldown, threshold, and burst cap.
    /// Returns true if the note passes all gates. Updates state in-place.
    static func shouldTrigger(
        streamId: String,
        config: ChannelConfig,
        mapped: [String: Double],
        state: inout [String: StreamState],
        nowMs: Double? = nil
    ) -> Bool {
        let now = nowMs ?? Date().timeIntervalSince1970 * 1000
        var ss = state[streamId] ?? StreamState()

        // Cooldown gate
        let cooldown = max(0, config.eventCooldownMs ?? 0)
        if cooldown > 0, let last = ss.lastTriggeredAtMs, now - last < cooldown {
            state[streamId] = ss
            return false
        }

        // Threshold gate
        let threshold = max(0, config.eventTriggerThreshold ?? 0)
        if threshold > 0 {
            let metric = eventMetric(from: mapped)
            if let metric, let prev = ss.lastEventMetric, abs(metric - prev) < threshold {
                state[streamId] = ss
                return false
            }
            ss.lastEventMetric = metric
        }

        // Burst cap gate
        let cap = max(0, config.eventBurstCap ?? 0)
        if cap > 0 {
            let windowMs = max(100, config.eventBurstWindowMs ?? 1200)
            ss.eventHistory = ss.eventHistory.filter { now - $0 <= windowMs }
            if ss.eventHistory.count >= cap {
                state[streamId] = ss
                return false
            }
            ss.eventHistory.append(now)
        }

        // Trigger probability gate
        if let prob = mapped["triggerProbability"], prob < 1 {
            if Double.random(in: 0...1) > max(0, min(1, prob)) {
                state[streamId] = ss
                return false
            }
        }

        ss.lastTriggeredAtMs = now
        state[streamId] = ss
        return true
    }

    /// Adjust velocity based on articulation.
    static func articulationVelocity(_ velocity: Double, articulation: ChannelConfig.Articulation) -> Double {
        let base = max(0.05, min(1, velocity))
        let factor: Double
        switch articulation {
        case .soft: factor = 0.75
        case .punchy: factor = 1.2
        case .neutral: factor = 1.0
        }
        return max(0.05, min(1, base * factor))
    }
}
