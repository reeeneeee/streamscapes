import SwiftUI

struct ContentView: View {
    @Environment(WatchViewModel.self) private var vm
    @State private var showManualEntry = false
    @State private var manualKey = ""

    var body: some View {
        @Bindable var vm = vm

        ScrollView {
            VStack(spacing: 16) {
                // Status
                HStack(spacing: 6) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(statusText)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }

                if vm.waitingForPhone {
                    // Waiting for iPhone to send API key
                    VStack(spacing: 8) {
                        ProgressView()
                            .tint(Color(red: 0.91, green: 0.55, blue: 0.55))
                        Text("open streamscapes\non your iPhone")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Text("sign in to start streaming")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)

                        // Manual entry fallback
                        Button("enter key manually") {
                            showManualEntry = true
                        }
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                        .padding(.top, 8)
                    }
                } else if vm.state == .running {
                    // Streaming
                    if vm.spanCount > 0 {
                        Text("\(vm.spanCount)")
                            .font(.system(size: 36, weight: .thin, design: .rounded))
                            .foregroundStyle(Color(red: 0.91, green: 0.55, blue: 0.55))
                        Text("spans sent")
                            .font(.system(size: 10, weight: .regular))
                            .foregroundStyle(.tertiary)
                    } else {
                        Text("connecting...")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                }

                // Error
                if let error = vm.errorMessage {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                // Start/Stop (only show when we have an API key)
                if !vm.waitingForPhone {
                    Button {
                        if vm.state == .running {
                            vm.stop()
                        } else {
                            vm.start()
                        }
                    } label: {
                        Text(vm.state == .running ? "Stop" : "Start")
                            .font(.system(size: 14, weight: .medium))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(vm.state == .running ? .red.opacity(0.7) : Color(red: 0.91, green: 0.55, blue: 0.55))
                }
            }
            .padding()
        }
        .onAppear {
            vm.loadConfig()
            vm.activateSession()
        }
        .sheet(isPresented: $showManualEntry) {
            VStack(spacing: 12) {
                Text("API Key")
                    .font(.system(size: 13, weight: .medium))
                TextField("Paste key", text: $manualKey)
                    .font(.system(size: 12))
                Button("Connect") {
                    guard !manualKey.isEmpty else { return }
                    vm.apiKey = manualKey
                    vm.waitingForPhone = false
                    vm.saveConfig()
                    vm.start()
                    showManualEntry = false
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.91, green: 0.55, blue: 0.55))
            }
            .padding()
        }
    }

    private var statusColor: Color {
        switch vm.state {
        case .idle: return vm.waitingForPhone ? .orange : .gray
        case .running: return .green
        case .error: return .red
        }
    }

    private var statusText: String {
        switch vm.state {
        case .idle: return vm.waitingForPhone ? "waiting" : "idle"
        case .running: return "streaming"
        case .error: return "error"
        }
    }
}
