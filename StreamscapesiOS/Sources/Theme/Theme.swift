import SwiftUI

enum Theme {
    // MARK: - Colors
    static let bgPrimary = Color(hex: 0x0D0D0D)
    static let bgSurface = Color.white.opacity(0.025)
    static let bgElevated = Color.white.opacity(0.06)

    static let textPrimary = Color(hex: 0xF5F0EB)
    static let textSecondary = Color(hex: 0xF5F0EB).opacity(0.6)
    static let textMuted = Color(hex: 0xF5F0EB).opacity(0.45)
    static let textWhisper = Color(hex: 0xF5F0EB).opacity(0.3)

    static let accent = Color(hex: 0x7C444F)
    static let border = Color.white.opacity(0.05)
    static let borderStrong = Color.white.opacity(0.1)

    // MARK: - Stream Colors (match web CSS vars)
    static let streamWeather = Color(hex: 0xC4889A)
    static let streamFlights = Color(hex: 0x9AB4C6)
    static let streamWikipedia = Color(hex: 0xA3C484)
    static let streamWiki = Color(hex: 0xA3C484)
    static let streamRSS = Color(hex: 0xD4B87A)
    static let streamStocks = Color(hex: 0xE8C96E)

    static let streamWatch = Color(hex: 0xE88D8D)

    // Neon palette for private/ingest channels (matches web OTLP_COLORS)
    private static let neonColors: [Color] = [
        Color(hex: 0x00E5FF), Color(hex: 0xFF3DFF), Color(hex: 0x39FF14),
        Color(hex: 0xFFD600), Color(hex: 0x7C4DFF), Color(hex: 0x00FFAB),
        Color(hex: 0xFF6E40), Color(hex: 0x76FF03), Color(hex: 0xE040FB),
        Color(hex: 0x18FFFF), Color(hex: 0xFFAB40), Color(hex: 0x00E676),
    ]
    nonisolated(unsafe) private static var neonIndex = 0
    nonisolated(unsafe) private static var neonMap: [String: Color] = [:]

    static func streamColor(for id: String) -> Color {
        switch id {
        case "weather", "weather:temp", "weather:clouds": return streamWeather
        case "flights": return streamFlights
        case "wikipedia": return streamWikipedia
        case "rss": return streamRSS
        case "stocks": return streamStocks
        default: break
        }
        // Watch channels get warm coral
        if id.hasPrefix("watch:") {
            return streamWatch
        }
        // Private channels get neon colors
        // System channels get a consistent greyish lilac (matching web)
        if id.hasPrefix("system:") {
            return Color(hex: 0x9E8FB0)
        }
        let prefixes = ["otlp:", "dd:", "notify:", "github:", "chrome:", "undefined:"]
        if prefixes.contains(where: { id.hasPrefix($0) }) {
            if let cached = neonMap[id] { return cached }
            let color = neonColors[neonIndex % neonColors.count]
            neonIndex += 1
            neonMap[id] = color
            return color
        }
        return Color.gray
    }

    static func streamLabel(for id: String) -> String {
        switch id {
        case "weather": return "Weather"
        case "weather:temp": return "Temp"
        case "weather:clouds": return "Clouds"
        case "flights": return "Air Traffic"
        case "wikipedia": return "Wikipedia"
        case "archive": return "Internet Archive"
        case "rss": return "RSS"
        case "stocks": return "Stocks"
        case "watch:heartRate": return "Heart Rate"
        case "watch:steps": return "Steps"
        default: break
        }
        // Strip prefix for sub-channels: "chrome:reddit.com" → "reddit.com"
        var name = id
        if let colonIdx = id.firstIndex(of: ":") {
            name = String(id[id.index(after: colonIdx)...])
        }
        return shortenServiceName(name)
    }

    /// Shorten long hyphenated service names: "filament-prod-fastapi-service" → "fastapi"
    private static func shortenServiceName(_ name: String) -> String {
        guard name.count > 20 else { return name }
        let parts = name.split(separator: "-").map(String.init)
        let drop: Set<String> = ["prod", "staging", "dev", "qa", "service", "svc"]
        let meaningful = parts.filter { !drop.contains($0) }
        if !meaningful.isEmpty {
            let short = meaningful.joined(separator: "-")
            if !short.isEmpty { return short }
        }
        if parts.count > 2 { return parts.suffix(2).joined(separator: "-") }
        return name
    }

    // MARK: - Fonts
    // Space Grotesk for display, DM Sans for body
    // Loaded via Info.plist font registration or system fallback
    static let displayFont = "SpaceGrotesk-Light"
    static let bodyFont = "DMSans-Regular"
    static let bodyMediumFont = "DMSans-Medium"
}

// MARK: - Color hex init
extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
