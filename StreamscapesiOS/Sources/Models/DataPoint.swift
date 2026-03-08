import Foundation

struct DataPoint: Sendable {
    let streamId: String
    let timestamp: Date
    let fields: [String: Double]
    let metadata: [String: String]
}
