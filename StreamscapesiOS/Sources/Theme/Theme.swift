import SwiftUI

enum Theme {
    // MARK: - Colors
    static let bgPrimary = Color(hex: 0x0D0D0D)
    static let bgSurface = Color.white.opacity(0.025)
    static let bgElevated = Color.white.opacity(0.06)

    static let textPrimary = Color(hex: 0xF5F0EB)
    static let textSecondary = Color(hex: 0xF5F0EB).opacity(0.5)
    static let textMuted = Color(hex: 0xF5F0EB).opacity(0.35)
    static let textWhisper = Color(hex: 0xF5F0EB).opacity(0.22)

    static let accent = Color(hex: 0x7C444F)
    static let border = Color.white.opacity(0.05)
    static let borderStrong = Color.white.opacity(0.1)

    // MARK: - Stream Colors
    static let streamWeather = Color(hex: 0x7C444F)
    static let streamFlights = Color(hex: 0x5C7285)
    static let streamWikipedia = Color(hex: 0x5D8736)
    static let streamWiki = Color(hex: 0x4D6C81)
    static let streamRSS = Color(hex: 0xB8860B)
    static let streamStocks = Color(hex: 0xE6A817)

    static func streamColor(for id: String) -> Color {
        switch id {
        case "weather": streamWeather
        case "flights": streamFlights
        case "wikipedia": streamWikipedia
        case "rss": streamRSS
        case "stocks": streamStocks
        default: Color.gray
        }
    }

    static func streamLabel(for id: String) -> String {
        switch id {
        case "weather": "Weather"
        case "flights": "Flights"
        case "wikipedia": "Wikipedia"
        case "rss": "RSS"
        case "stocks": "Stocks"
        default: id.capitalized
        }
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
