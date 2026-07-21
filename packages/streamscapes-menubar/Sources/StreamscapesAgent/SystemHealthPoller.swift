import Foundation

/// Polls local system health: CPU, memory, disk, and running Docker containers.
/// Sends each metric as an OTLP span to the streamscapes ingest endpoint.
final class SystemHealthPoller {
    private let endpoint: String
    private let apiKey: String
    private let callback: (PollerEvent) -> Void
    private var timer: Timer?
    private let interval: TimeInterval = 5 // every 5s

    init(endpoint: String, apiKey: String, callback: @escaping (PollerEvent) -> Void) {
        self.endpoint = endpoint
        self.apiKey = apiKey
        self.callback = callback
    }

    func start() {
        poll() // immediate first poll
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func poll() {
        Task {
            // Gather all metrics
            let cpu = Self.cpuUsage()
            let mem = Self.memoryUsage()
            let disk = Self.diskUsage()
            let containers = Self.dockerContainers()

            // Send CPU metric
            let cpuPercent = cpu.user + cpu.system
            await send(service: "system", spanName: "cpu", fields: [
                "user": cpu.user,
                "system": cpu.system,
                "idle": cpu.idle,
                "total": cpuPercent,
                "percent": cpuPercent,
            ])

            // Send memory metric
            let memPercent = mem.totalGB > 0 ? (mem.usedGB / mem.totalGB) * 100 : 0
            await send(service: "system", spanName: "memory", fields: [
                "usedGB": mem.usedGB,
                "totalGB": mem.totalGB,
                "percent": memPercent,
            ])

            // Send disk metric
            let diskPercent = disk.totalGB > 0 ? (disk.usedGB / disk.totalGB) * 100 : 0
            await send(service: "system", spanName: "disk", fields: [
                "usedGB": disk.usedGB,
                "totalGB": disk.totalGB,
                "freeGB": disk.freeGB,
                "percent": diskPercent,
            ])

            // Send each running container
            for container in containers {
                await send(service: "docker", spanName: container.name, fields: [
                    "image": container.image,
                    "status": container.status,
                    "ports": container.ports,
                    "containerId": container.id,
                    "running": container.status.contains("Up") ? 1.0 : 0.0,
                ])
            }

            // If no containers, send a summary
            if containers.isEmpty {
                await send(service: "docker", spanName: "status", fields: [
                    "containerCount": 0.0,
                    "status": "no containers",
                ])
            } else {
                await send(service: "docker", spanName: "summary", fields: [
                    "containerCount": Double(containers.count),
                ])
            }

            callback(.log("system: cpu \(Int(cpu.user + cpu.system))% mem \(Int(mem.usedGB))/\(Int(mem.totalGB))GB docker \(containers.count)"))
        }
    }

    // MARK: - OTLP send

    private func send(service: String, spanName: String, fields: [String: Any]) async {
        guard let url = URL(string: endpoint) else { return }

        let now = UInt64(Date().timeIntervalSince1970 * 1_000_000_000)
        let traceId = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(32)
        let spanId = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16)

        // Build attributes from fields
        var attrs: [[String: Any]] = [
            ["key": "service.name", "value": ["stringValue": service]],
        ]
        for (key, val) in fields {
            if let d = val as? Double {
                attrs.append(["key": key, "value": ["doubleValue": d]])
            } else if let i = val as? Int {
                attrs.append(["key": key, "value": ["intValue": String(i)]])
            } else {
                attrs.append(["key": key, "value": ["stringValue": String(describing: val)]])
            }
        }

        let payload: [String: Any] = [
            "resourceSpans": [[
                "resource": [
                    "attributes": [
                        ["key": "service.name", "value": ["stringValue": service]]
                    ]
                ],
                "scopeSpans": [[
                    "spans": [[
                        "traceId": String(traceId),
                        "spanId": String(spanId),
                        "name": spanName,
                        "kind": 1,
                        "startTimeUnixNano": String(now),
                        "endTimeUnixNano": String(now + 1_000_000),
                        "attributes": attrs,
                        "status": ["code": 0],
                    ]]
                ]]
            ]]
        ]

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue(kAgentVersion, forHTTPHeaderField: "X-Agent-Version")
        req.httpBody = body

        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            if let http = res as? HTTPURLResponse {
                if http.statusCode == 401 {
                    callback(.authError)
                } else {
                    callback(.authOk)
                    callback(.spanSent(service))
                }
            }
        } catch {
            callback(.error("system health send failed: \(error.localizedDescription)"))
        }
    }

    // MARK: - System metrics

    struct CPUUsage { let user: Double; let system: Double; let idle: Double }

    static func cpuUsage() -> CPUUsage {
        var loadInfo = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &loadInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return CPUUsage(user: 0, system: 0, idle: 0) }

        let user = Double(loadInfo.cpu_ticks.0)
        let system = Double(loadInfo.cpu_ticks.1)
        let idle = Double(loadInfo.cpu_ticks.2)
        let total = user + system + idle + Double(loadInfo.cpu_ticks.3)
        guard total > 0 else { return CPUUsage(user: 0, system: 0, idle: 0) }

        return CPUUsage(
            user: (user / total) * 100,
            system: (system / total) * 100,
            idle: (idle / total) * 100
        )
    }

    struct MemoryUsage { let usedGB: Double; let totalGB: Double }

    static func memoryUsage() -> MemoryUsage {
        let totalBytes = Double(ProcessInfo.processInfo.physicalMemory)
        let totalGB = totalBytes / 1_073_741_824

        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return MemoryUsage(usedGB: 0, totalGB: totalGB) }

        let pageSize = Double(vm_kernel_page_size)
        let active = Double(stats.active_count) * pageSize
        let wired = Double(stats.wire_count) * pageSize
        let compressed = Double(stats.compressor_page_count) * pageSize
        let usedGB = (active + wired + compressed) / 1_073_741_824

        return MemoryUsage(usedGB: usedGB, totalGB: totalGB)
    }

    struct DiskUsage { let usedGB: Double; let totalGB: Double; let freeGB: Double }

    static func diskUsage() -> DiskUsage {
        let home = FileManager.default.homeDirectoryForCurrentUser
        guard let values = try? home.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey]) else {
            return DiskUsage(usedGB: 0, totalGB: 0, freeGB: 0)
        }
        let total = Double(values.volumeTotalCapacity ?? 0) / 1_073_741_824
        let free = Double(values.volumeAvailableCapacityForImportantUsage ?? 0) / 1_073_741_824
        return DiskUsage(usedGB: total - free, totalGB: total, freeGB: free)
    }

    // MARK: - Docker

    struct Container {
        let id: String
        let name: String
        let image: String
        let status: String
        let ports: String
    }

    static func dockerContainers() -> [Container] {
        let pipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/local/bin/docker")
        process.arguments = ["ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        // Also try /opt/homebrew/bin/docker for Apple Silicon
        let paths = ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"]
        var found = false
        for path in paths {
            if FileManager.default.isExecutableFile(atPath: path) {
                process.executableURL = URL(fileURLWithPath: path)
                found = true
                break
            }
        }
        guard found else { return [] }

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return []
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8) else { return [] }

        return output.split(separator: "\n").compactMap { line in
            let parts = line.split(separator: "\t", maxSplits: 4, omittingEmptySubsequences: false)
            guard parts.count >= 4 else { return nil }
            return Container(
                id: String(parts[0]),
                name: String(parts[1]),
                image: String(parts[2]),
                status: String(parts[3]),
                ports: parts.count > 4 ? String(parts[4]) : ""
            )
        }
    }
}
