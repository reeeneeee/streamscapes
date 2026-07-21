import Foundation
import HealthKit

enum PollerEvent {
    case spanSent(String)
    case authError
    case error(String)
}

final class HealthPoller {
    private let store = HKHealthStore()
    private let client: OTLPClient
    private let onEvent: (PollerEvent) -> Void

    private var heartRateQuery: HKAnchoredObjectQuery?
    private var stepsTimer: Timer?
    private var lastStepCount: Double = 0

    init(client: OTLPClient, onEvent: @escaping (PollerEvent) -> Void) {
        self.client = client
        self.onEvent = onEvent
    }

    func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }

        let types: Set<HKSampleType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.stepCount),
        ]

        do {
            try await store.requestAuthorization(toShare: [], read: types)
            return true
        } catch {
            onEvent(.error("HealthKit auth failed: \(error.localizedDescription)"))
            return false
        }
    }

    func start() {
        startHeartRateQuery()
        startStepsPolling()
    }

    func stop() {
        if let q = heartRateQuery {
            store.stop(q)
            heartRateQuery = nil
        }
        stepsTimer?.invalidate()
        stepsTimer = nil
    }

    // MARK: - Heart Rate (real-time anchored query)

    private func startHeartRateQuery() {
        let type = HKQuantityType(.heartRate)
        let query = HKAnchoredObjectQuery(
            type: type,
            predicate: nil,
            anchor: nil,
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, _, _ in
            self?.processHeartRateSamples(samples)
        }
        query.updateHandler = { [weak self] _, samples, _, _, _ in
            self?.processHeartRateSamples(samples)
        }
        store.execute(query)
        heartRateQuery = query
    }

    private func processHeartRateSamples(_ samples: [HKSample]?) {
        guard let quantitySamples = samples as? [HKQuantitySample] else { return }
        for sample in quantitySamples {
            let bpm = sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            let percent = max(0, min(100, (bpm - 40) / 140 * 100))
            Task {
                let result = await client.postSpan(
                    serviceName: "watch",
                    spanName: "heartRate",
                    fields: ["bpm": bpm, "percent": percent],
                    timestampMs: Int64(sample.startDate.timeIntervalSince1970 * 1000)
                )
                if result.ok {
                    onEvent(.spanSent("heartRate"))
                } else if result.status == 401 {
                    onEvent(.authError)
                }
            }
        }
    }

    // MARK: - Steps (30s polling, delta)

    private func startStepsPolling() {
        // Get initial cumulative count
        fetchCumulativeSteps { [weak self] total in
            self?.lastStepCount = total
        }
        stepsTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.pollSteps()
        }
    }

    private func pollSteps() {
        fetchCumulativeSteps { [weak self] total in
            guard let self else { return }
            let delta = max(0, total - self.lastStepCount)
            self.lastStepCount = total
            guard delta > 0 else { return }
            Task {
                let result = await self.client.postSpan(
                    serviceName: "watch",
                    spanName: "steps",
                    fields: ["stepDelta": delta, "totalSteps": total]
                )
                if result.ok {
                    self.onEvent(.spanSent("steps"))
                } else if result.status == 401 {
                    self.onEvent(.authError)
                }
            }
        }
    }

    private func fetchCumulativeSteps(completion: @escaping (Double) -> Void) {
        let type = HKQuantityType(.stepCount)
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
            let total = stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            completion(total)
        }
        store.execute(query)
    }

}
