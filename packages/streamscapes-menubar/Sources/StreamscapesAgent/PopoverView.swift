import SwiftUI

struct PopoverView: View {
    @ObservedObject var agent: AgentViewModel
    @State private var showSaved = false
    @State private var suppressSave = true

    private let bg = Color(hex: 0x0e0e10)
    private let surface = Color(hex: 0x1a1a1e)
    private let border = Color(hex: 0x2a2a2e)
    private let textColor = Color(hex: 0xe8e6e3)
    private let textMuted = Color(hex: 0x8a8a8e)
    private let accent = Color(hex: 0xC4889A)
    private let green = Color(hex: 0xA3C484)
    private let red = Color(hex: 0xe06060)
    private let yellow = Color(hex: 0xD4B87A)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("streamscapes")
                    .font(.system(size: 15, weight: .light))
                    .tracking(-0.3)
                    .foregroundColor(textColor)
                Spacer()
                Text("saved")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(green)
                    .opacity(showSaved ? 1 : 0)
                    .animation(.easeInOut(duration: 0.3), value: showSaved)
            }

            // Endpoint
            fieldLabel("STREAMSCAPES URL")
            TextField("https://www.streamscapes.fm", text: $agent.endpoint, prompt: Text("https://www.streamscapes.fm").foregroundColor(.white.opacity(0.5)))
                .textFieldStyle(.plain)
                .padding(8)
                .background(surface)
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(border, lineWidth: 1))
                .font(.system(size: 12))
                .foregroundColor(textColor)

            // API Key
            fieldLabel("API KEY")
            SecureField("", text: $agent.apiKey, prompt: Text("< paste from Inputs tab >").foregroundColor(.white.opacity(0.4)))
                .textFieldStyle(.plain)
                .padding(8)
                .background(surface)
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(border, lineWidth: 1))
                .font(.system(size: 12))
                .foregroundColor(textColor)

            // Modules
            fieldLabel("MODULES")

            Toggle("Notifications", isOn: $agent.enableNotif)
                .toggleStyle(.checkbox)
                .font(.system(size: 12))
                .foregroundColor(textColor)

            Toggle("System Health (CPU, memory, disk, Docker)", isOn: $agent.enableSystem)
                .toggleStyle(.checkbox)
                .font(.system(size: 12))
                .foregroundColor(textColor)

            Toggle("Datadog", isOn: $agent.enableDd)
                .toggleStyle(.checkbox)
                .font(.system(size: 12))
                .foregroundColor(textColor)

            if agent.enableDd {
                VStack(alignment: .leading, spacing: 6) {
                    SecureField("", text: $agent.ddApiKey, prompt: Text("< Datadog API key >").foregroundColor(.white.opacity(0.4)))
                        .textFieldStyle(.plain)
                        .padding(6)
                        .font(.system(size: 12))
                        .foregroundColor(textColor)
                    SecureField("", text: $agent.ddAppKey, prompt: Text("< Datadog Application key >").foregroundColor(.white.opacity(0.4)))
                        .textFieldStyle(.plain)
                        .padding(6)
                        .font(.system(size: 12))
                        .foregroundColor(textColor)
                    Picker("", selection: $agent.ddSite) {
                        Text("datadoghq.com").tag("datadoghq.com")
                        Text("datadoghq.eu").tag("datadoghq.eu")
                        Text("us3.datadoghq.com").tag("us3.datadoghq.com")
                        Text("us5.datadoghq.com").tag("us5.datadoghq.com")
                        Text("ap1.datadoghq.com").tag("ap1.datadoghq.com")
                        Text("ddog-gov.com").tag("ddog-gov.com")
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .font(.system(size: 12))
                    .colorScheme(.dark)
                    .padding(.horizontal, 2)
                    TextField("", text: $agent.ddQuery, prompt: Text("optional — e.g. service:my-app env:prod").foregroundColor(.white.opacity(0.25)))
                        .textFieldStyle(.plain)
                        .padding(6)
                        .font(.system(size: 11))
                        .foregroundColor(textColor)

                    Divider().background(border).padding(.vertical, 2)

                    Toggle("Monitors (alerts)", isOn: $agent.enableDdMonitors)
                        .toggleStyle(.checkbox)
                        .font(.system(size: 11))
                        .foregroundColor(textColor)
                        .padding(.horizontal, 6)

                    if agent.enableDdMonitors {
                        TextField("", text: $agent.ddMonitorTags, prompt: Text("optional — e.g. team:infra,env:prod").foregroundColor(.white.opacity(0.25)))
                            .textFieldStyle(.plain)
                            .padding(6)
                            .font(.system(size: 11))
                            .foregroundColor(textColor)
                    }
                }
                .background(surface)
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(border, lineWidth: 1))
                .padding(.leading, 20)
            }

            Divider().background(border)

            // Start / Stop
            HStack(spacing: 8) {
                Button(action: { agent.start() }) {
                    Text("Start")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(AccentButtonStyle(accent: accent, bg: bg))
                .disabled(agent.state == .running)

                Button(action: { agent.stop() }) {
                    Text("Stop")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(surface: surface, border: border, textMuted: textMuted))
                .disabled(agent.state != .running)
            }

            // Status
            statusView

            // Update nudge
            if let url = agent.updateAvailable {
                HStack(spacing: 6) {
                    Circle().fill(accent).frame(width: 6, height: 6)
                    Text("Update available")
                        .font(.system(size: 11))
                        .foregroundColor(accent)
                    Spacer()
                    Link("Download", destination: URL(string: url)!)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(accent)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }

            // FDA warning
            if agent.fdaRequired {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Notifications require Full Disk Access.")
                        .font(.system(size: 10, weight: .medium))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("System Settings → Privacy & Security → Full Disk Access → add this app, then relaunch.")
                        .font(.system(size: 10))
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open System Settings") {
                        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!)
                    }
                    .font(.system(size: 10))
                }
                .foregroundColor(yellow)
                .padding(10)
                .background(yellow.opacity(0.08))
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(yellow.opacity(0.2), lineWidth: 1))
            }

            Spacer(minLength: 0)

            // Quit
            HStack {
                Spacer()
                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
                .font(.system(size: 10))
                .foregroundColor(textMuted)
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(bg)
        .onAppear {
            suppressSave = true
            agent.loadConfig()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { suppressSave = false }
        }
        .onDisappear { agent.saveConfig() }
        .onChange(of: agent.apiKey) { save() }
        .onChange(of: agent.endpoint) { save() }
        .onChange(of: agent.ddApiKey) { save() }
        .onChange(of: agent.ddAppKey) { save() }
        .onChange(of: agent.ddSite) { save() }
        .onChange(of: agent.enableNotif) { save() }
        .onChange(of: agent.enableSystem) { save() }
        .onChange(of: agent.enableDd) { save() }
        .onChange(of: agent.ddQuery) { save() }
        .onChange(of: agent.enableDdMonitors) { save() }
        .onChange(of: agent.ddMonitorTags) { save() }
    }

    private func save() {
        agent.saveConfig()
        guard !suppressSave else { return }
        showSaved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            showSaved = false
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .tracking(0.6)
            .foregroundColor(textMuted)
    }

    @ViewBuilder
    private var statusView: some View {
        switch agent.state {
        case .running:
            let count = agent.spanCount
            Text("Running — \(count) span\(count == 1 ? "" : "s") sent")
                .font(.system(size: 11))
                .foregroundColor(green)
        case .error:
            Text(agent.errorMessage ?? "Error")
                .font(.system(size: 11))
                .foregroundColor(red)
        case .idle:
            Text("Stopped")
                .font(.system(size: 11))
                .foregroundColor(textMuted)
        }
    }
}

// MARK: - Button styles

struct AccentButtonStyle: ButtonStyle {
    let accent: Color
    let bg: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .padding(.vertical, 8)
            .background(accent)
            .foregroundColor(bg)
            .cornerRadius(6)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    let surface: Color
    let border: Color
    let textMuted: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .padding(.vertical, 8)
            .background(surface)
            .foregroundColor(textMuted)
            .cornerRadius(6)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(border, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Color hex helper

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
