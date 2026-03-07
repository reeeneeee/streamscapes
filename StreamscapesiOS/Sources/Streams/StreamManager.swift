import Foundation

actor StreamManager {
    private var tasks: [String: Task<Void, Never>] = [:]
    private var listeners: [String: (DataPoint) -> Void] = [:]

    func start(plugin: any StreamPlugin, onData: @MainActor @escaping @Sendable (DataPoint) -> Void) {
        stop(id: plugin.id)

        let stream = plugin.connect()
        let id = plugin.id
        tasks[id] = Task {
            for await dp in stream {
                await MainActor.run { onData(dp) }
            }
        }
    }

    func stop(id: String) {
        tasks[id]?.cancel()
        tasks.removeValue(forKey: id)
    }

    func stopAll() {
        for (_, task) in tasks { task.cancel() }
        tasks.removeAll()
    }
}
