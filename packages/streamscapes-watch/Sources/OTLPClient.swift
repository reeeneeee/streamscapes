import Foundation

let kWatchAgentVersion = "0.1.0"

struct OTLPClient {
    let endpoint: String
    let apiKey: String

    func postSpan(
        serviceName: String,
        spanName: String,
        fields: [String: Any] = [:],
        timestampMs: Int64? = nil,
        statusCode: Int = 1
    ) async -> (ok: Bool, status: Int?) {
        let ts = timestampMs ?? Int64(Date().timeIntervalSince1970 * 1000)
        let startNano = "\(ts * 1_000_000)"
        let endNano = "\((ts + 1) * 1_000_000)"

        let attributes: [[String: Any]] = fields.map { key, val in
            if let num = val as? Int {
                return ["key": key, "value": ["intValue": num]]
            }
            if let num = val as? Double {
                return ["key": key, "value": ["stringValue": "\(num)"]]
            }
            return ["key": key, "value": ["stringValue": "\(val)"]]
        }

        let body: [String: Any] = [
            "resourceSpans": [[
                "resource": [
                    "attributes": [["key": "service.name", "value": ["stringValue": serviceName]]],
                ],
                "scopeSpans": [[
                    "spans": [[
                        "name": spanName,
                        "kind": 0,
                        "startTimeUnixNano": startNano,
                        "endTimeUnixNano": endNano,
                        "status": ["code": statusCode],
                        "attributes": attributes,
                    ]],
                ]],
            ]],
        ]

        guard let url = URL(string: "\(endpoint)?source=watch"),
              let jsonData = try? JSONSerialization.data(withJSONObject: body)
        else { return (false, nil) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(kWatchAgentVersion, forHTTPHeaderField: "X-Agent-Version")
        request.httpBody = jsonData

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (200...299 ~= code, code)
        } catch {
            return (false, nil)
        }
    }
}
