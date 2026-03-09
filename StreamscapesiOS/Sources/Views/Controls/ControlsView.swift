import SwiftUI

enum SettingsDestination: Hashable {
    case global
    case presets
    case sonification
    case mappings
    case effects
}

struct ControlsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Text("streamscapes")
                        .font(.custom("SpaceGrotesk-Light", size: 15))
                        .foregroundStyle(Theme.textSecondary)
                        .padding(.top, 8)
                        .padding(.bottom, 16)

                    MixerView()

                    // Global Musical Frame — always visible
                    InlineGlobalFrame()
                        .padding(.top, 16)
                        .padding(.horizontal, 16)

                    VStack(spacing: 1) {
                        NavigationLink(value: SettingsDestination.presets) {
                            SettingsRow(number: "01", title: "Presets")
                        }
                        NavigationLink(value: SettingsDestination.sonification) {
                            SettingsRow(number: "02", title: "Sonification")
                        }
                        NavigationLink(value: SettingsDestination.mappings) {
                            SettingsRow(number: "03", title: "Mappings")
                        }
                        NavigationLink(value: SettingsDestination.effects) {
                            SettingsRow(number: "04", title: "Effects")
                        }
                    }
                    .padding(.top, 12)
                    .padding(.horizontal, 16)
                }
            }
            .scrollIndicators(.hidden)
            .navigationDestination(for: SettingsDestination.self) { dest in
                switch dest {
                case .global: GlobalSettingsView()
                case .presets: PresetsView()
                case .sonification: SonificationView()
                case .mappings: MappingsView()
                case .effects: EffectsView()
                }
            }
        }
    }
}

// MARK: - Inline Global Musical Frame

private struct InlineGlobalFrame: View {
    @Environment(AppStore.self) private var store

    private let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private let octaves = [2, 3, 4, 5, 6]
    private let scales = [
        "major pentatonic", "minor pentatonic", "major", "minor", "blues",
        "chromatic", "dorian", "mixolydian", "lydian", "phrygian", "whole tone", "diminished",
    ]

    private var noteName: String {
        store.global.rootNote.replacingOccurrences(of: #"\d+$"#, with: "", options: .regularExpression)
    }
    private var octave: Int {
        Int(store.global.rootNote.range(of: #"\d+$"#, options: .regularExpression).map { String(store.global.rootNote[$0]) } ?? "4") ?? 4
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("GLOBAL MUSICAL FRAME")
                .font(.custom("DMSans-Regular", size: 10))
                .tracking(1.1)
                .foregroundStyle(Theme.textWhisper)

            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Root")
                        .font(.custom("DMSans-Regular", size: 10))
                        .foregroundStyle(Theme.textMuted)
                    Picker("Root", selection: Binding(
                        get: { noteName },
                        set: { v in store.updateGlobal { $0.rootNote = "\(v)\(octave)" } }
                    )) {
                        ForEach(notes, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Oct")
                        .font(.custom("DMSans-Regular", size: 10))
                        .foregroundStyle(Theme.textMuted)
                    Picker("Octave", selection: Binding(
                        get: { octave },
                        set: { v in store.updateGlobal { $0.rootNote = "\(noteName)\(v)" } }
                    )) {
                        ForEach(octaves, id: \.self) { Text("\($0)").tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Scale")
                        .font(.custom("DMSans-Regular", size: 10))
                        .foregroundStyle(Theme.textMuted)
                    Picker("Scale", selection: Binding(
                        get: { store.global.scale },
                        set: { v in store.updateGlobal { $0.scale = v } }
                    )) {
                        ForEach(scales, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
            }

            HStack {
                Text("Tempo")
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textMuted)
                Slider(value: Binding(
                    get: { Double(store.global.tempo) },
                    set: { v in store.updateGlobal { $0.tempo = Int(v) } }
                ), in: 40...240, step: 1)
                .tint(Theme.accent)
                Text("\(store.global.tempo)")
                    .font(.custom("SpaceGrotesk-Regular", size: 12))
                    .foregroundStyle(Theme.textMuted)
                    .frame(width: 32, alignment: .trailing)
            }

            Toggle("Lock", isOn: Bindable(store).lockGlobalFrame)
                .tint(Theme.accent)
                .font(.custom("DMSans-Regular", size: 12))
                .foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

struct SettingsRow: View {
    let number: String
    let title: String

    var body: some View {
        HStack {
            HStack(spacing: 10) {
                Text(number)
                    .font(.custom("DMSans-Regular", size: 10))
                    .tracking(1)
                    .foregroundStyle(Theme.textWhisper)

                Text(title)
                    .font(.custom("DMSans-Medium", size: 14))
                    .foregroundStyle(Theme.textSecondary.opacity(1.4))
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.textWhisper)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.02))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
