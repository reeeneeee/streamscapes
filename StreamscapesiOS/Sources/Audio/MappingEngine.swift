import Foundation

/// Pure-function mapping engine. Port of web's `mapping-engine.ts`.
/// No AudioKit dependencies — independently testable.
enum MappingEngine {
    struct StateEntry {
        var lastOutput: Double
        var lastUpdatedMs: Double
    }

    typealias MappingState = [String: StateEntry]

    /// Composite key matching web's `"prefix:index:source->target"` format.
    /// Prevents collisions when multiple mappings target the same param.
    static func stateKey(prefix: String, index: Int, mapping: SonificationMapping) -> String {
        "\(prefix):\(index):\(mapping.sourceField)->\(mapping.targetParam)"
    }

    /// Remove all state entries for a given stream prefix.
    static func clearState(for prefix: String, in state: inout MappingState) {
        state = state.filter { !$0.key.hasPrefix(prefix) }
    }

    /// Apply all mappings to a data point, returning mapped parameter values.
    static func applyMappings(
        dataPoint: DataPoint,
        mappings: [SonificationMapping],
        state: inout MappingState,
        stateKeyPrefix: String? = nil,
        nowMs: Double? = nil
    ) -> [String: Double] {
        var result: [String: Double] = [:]
        let now = nowMs ?? Date().timeIntervalSince1970 * 1000
        let prefix = stateKeyPrefix ?? dataPoint.streamId

        for (index, mapping) in mappings.enumerated() {
            guard let rawValue = dataPoint.fields[mapping.sourceField],
                  rawValue.isFinite else { continue }

            var mapped = applyCurve(
                value: rawValue,
                curve: mapping.curve,
                inputRange: mapping.inputRange,
                outputRange: mapping.outputRange,
                invert: mapping.invert
            )

            let key = stateKey(prefix: prefix, index: index, mapping: mapping)
            let prev = state[key]

            // Hysteresis: suppress small changes
            let hysteresis = max(0, mapping.hysteresis ?? 0)
            if hysteresis > 0, let prev, abs(mapped - prev.lastOutput) < hysteresis {
                mapped = prev.lastOutput
            }

            // Smoothing: exponential moving average
            let smoothingMs = max(0, mapping.smoothingMs ?? 0)
            if smoothingMs > 0, let prev {
                let dt = max(1, now - prev.lastUpdatedMs)
                let alpha = min(1, dt / smoothingMs)
                mapped = prev.lastOutput + (mapped - prev.lastOutput) * alpha
            }

            // Quantize
            let quantizeStep = max(0, mapping.quantizeStep ?? 0)
            if quantizeStep > 0 {
                mapped = (mapped / quantizeStep).rounded() * quantizeStep
            }

            state[key] = StateEntry(lastOutput: mapped, lastUpdatedMs: now)
            result[mapping.targetParam] = mapped
        }

        return result
    }

    /// Map a value through curve, input/output ranges, and optional inversion.
    /// Matches web's `applyCurve` exactly.
    static func applyCurve(
        value: Double,
        curve: SonificationMapping.CurveType,
        inputRange: [Double],
        outputRange: [Double],
        invert: Bool
    ) -> Double {
        guard inputRange.count == 2, outputRange.count == 2 else { return value }
        let inMin = inputRange[0], inMax = inputRange[1]
        let outMin = outputRange[0], outMax = outputRange[1]

        guard inMax != inMin else { return outMin }

        var t = max(0, min(1, (value - inMin) / (inMax - inMin)))

        if invert { t = 1 - t }

        switch curve {
        case .linear: break
        case .log: t = log10(1 + t * 9) // log1p(t*9)/log(10)
        case .exp: t = pow(t, 2)         // matches web's Math.pow(normalized, 2)
        case .step: t = (t * 4).rounded() / 4 // 5 steps
        }

        return outMin + t * (outMax - outMin)
    }
}
