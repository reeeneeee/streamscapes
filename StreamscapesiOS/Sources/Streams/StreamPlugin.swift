import Foundation

protocol StreamPlugin: Sendable {
    var id: String { get }
    func connect() -> AsyncStream<DataPoint>
}
