import SwiftUI

struct GlobalSettingsView: View {
    @Environment(AppStore.self) private var store

    private let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private let octaves = [2, 3, 4, 5, 6]
    private let scales = [
        "major pentatonic", "minor pentatonic", "major", "minor", "blues",
        "chromatic", "dorian", "mixolydian", "lydian", "phrygian", "whole tone", "diminished",
    ]

    private var noteName: String { store.global.rootNote.replacingOccurrences(of: #"\d+$"#, with: "", options: .regularExpression) }
    private var octave: Int {
        Int(store.global.rootNote.range(of: #"\d+$"#, options: .regularExpression).map { String(store.global.rootNote[$0]) } ?? "4") ?? 4
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                card("Global Musical Frame") {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 6) {
                            label("Root Note")
                            Picker("Root", selection: Binding(
                                get: { noteName },
                                set: { v in store.updateGlobal { $0.rootNote = "\(v)\(octave)" } }
                            )) {
                                ForEach(notes, id: \.self) { Text($0).tag($0) }
                            }
                            .pickerStyle(.menu)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            label("Octave")
                            Picker("Octave", selection: Binding(
                                get: { octave },
                                set: { v in store.updateGlobal { $0.rootNote = "\(noteName)\(v)" } }
                            )) {
                                ForEach(octaves, id: \.self) { Text("\($0)").tag($0) }
                            }
                            .pickerStyle(.menu)
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        label("Scale")
                        Picker("Scale", selection: Binding(
                            get: { store.global.scale },
                            set: { v in store.updateGlobal { $0.scale = v } }
                        )) {
                            ForEach(scales, id: \.self) { Text($0).tag($0) }
                        }
                        .pickerStyle(.menu)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            label("Tempo")
                            Spacer()
                            Text("\(store.global.tempo) BPM")
                                .font(.custom("SpaceGrotesk-Regular", size: 11))
                                .foregroundStyle(Theme.textMuted)
                        }
                        Slider(value: Binding(
                            get: { Double(store.global.tempo) },
                            set: { v in store.updateGlobal { $0.tempo = Int(v) } }
                        ), in: 40...240, step: 1)
                        .tint(Theme.accent)
                    }
                    Toggle("Lock Global Frame", isOn: Bindable(store).lockGlobalFrame)
                        .tint(Theme.accent)
                        .font(.custom("DMSans-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Global")
                    .font(.custom("SpaceGrotesk-Medium", size: 15))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .toolbarBackground(Theme.bgPrimary, for: .navigationBar)
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.custom("DMSans-Regular", size: 10))
                .tracking(1.1)
                .foregroundStyle(Theme.textWhisper)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.custom("DMSans-Regular", size: 10))
            .foregroundStyle(Theme.textMuted)
    }
}
