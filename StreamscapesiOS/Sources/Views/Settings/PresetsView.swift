import SwiftUI

struct PresetsView: View {
    @Environment(AppStore.self) private var store
    private var presets: [BuiltinPreset] { PresetCatalog.all(defaultChannels: AppStore.makeDefaultChannels()) }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    Button {
                        store.applyGenericSettingsAll()
                    } label: {
                        Text("Choose Generic Setting")
                            .font(.custom("DMSans-Medium", size: 12))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color(hex: 0x4ADE80))
                            .clipShape(Capsule())
                    }
                    Toggle("Lock Global Frame", isOn: Bindable(store).lockGlobalFrame)
                        .font(.custom("DMSans-Regular", size: 12))
                        .foregroundStyle(Theme.textMuted)
                        .tint(Theme.accent)
                }
                .padding(.bottom, 6)

                ForEach(presets, id: \.id) { preset in
                    Button {
                        store.applyPreset(preset)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(preset.name)
                                    .font(.custom("DMSans-Medium", size: 14))
                                    .foregroundStyle(Theme.textPrimary)
                                Spacer()
                                Text("CPU: \(preset.cpuCost)")
                                    .font(.custom("DMSans-Regular", size: 10))
                                    .foregroundStyle(Theme.textWhisper)
                            }
                            Text(preset.description)
                                .font(.custom("DMSans-Regular", size: 12))
                                .foregroundStyle(Theme.textMuted)
                            Text("Signals: \(preset.signalPlan)")
                                .font(.custom("DMSans-Regular", size: 11))
                                .foregroundStyle(Theme.textWhisper)
                            Text("Tags: \(preset.tags.joined(separator: ", "))")
                                .font(.custom("DMSans-Regular", size: 10))
                                .foregroundStyle(Theme.textWhisper)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.025))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Presets")
                    .font(.custom("SpaceGrotesk-Medium", size: 15))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .toolbarBackground(Theme.bgPrimary, for: .navigationBar)
    }
}
