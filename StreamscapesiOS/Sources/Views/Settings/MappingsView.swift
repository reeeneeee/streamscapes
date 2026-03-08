import SwiftUI

struct MappingsView: View {
    @Environment(AppStore.self) private var store

    private let knownSourceFields: [String: [String]] = [
        "weather": ["temperature", "feelsLike", "clouds", "humidity", "windSpeed"],
        "flights": ["distance", "speed", "altitude", "frequency", "lat", "lon"],
        "wikipedia": ["titleLength", "lengthDelta", "absLengthDelta"],
        "rss": ["titleLength", "contentLength", "hasImage"],
        "stocks": ["price", "prevClose", "changeFromClose", "priceDelta", "priceDeltaPct", "direction", "dayHigh", "dayLow"],
    ]

    private var selectedId: String { store.selectedChannelId ?? store.channelIds.first ?? "" }
    private var config: ChannelConfig? { store.channels[selectedId] }
    private var sourceFields: [String] { knownSourceFields[selectedId] ?? ["value"] }

    private var targetOptions: [String] {
        let ambient = ["frequency", "patternSelect", "noiseVolume", "pan", "detune"]
        let event = ["scaleIndex", "frequency", "velocity", "duration", "triggerProbability", "filterCutoff", "pan", "detune"]
        switch config?.behaviorType ?? .event {
        case .ambient:
            return ambient
        case .event:
            return event
        case .hybrid:
            return Array(Set(ambient + event)).sorted()
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                channelPicker

                if let config {
                    preMapFilters(config)

                    HStack {
                        Text("Mappings")
                            .font(.custom("SpaceGrotesk-Medium", size: 14))
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                        Button {
                            addMapping()
                        } label: {
                            Text("+ Add")
                                .font(.custom("DMSans-Medium", size: 11))
                                .foregroundStyle(Theme.textPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.06))
                                .clipShape(Capsule())
                        }
                    }

                    if config.mappings.isEmpty {
                        Text("No mappings configured")
                            .font(.custom("DMSans-Regular", size: 13))
                            .foregroundStyle(Theme.textMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 28)
                            .background(Color.white.opacity(0.02))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        ForEach(Array(config.mappings.enumerated()), id: \.offset) { index, mapping in
                            mappingCard(index: index, mapping: mapping)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Mappings")
                    .font(.custom("SpaceGrotesk-Medium", size: 15))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .toolbarBackground(Theme.bgPrimary, for: .navigationBar)
    }

    private var channelPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.channelIds, id: \.self) { id in
                    Button {
                        store.selectedChannelId = id
                    } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Theme.streamColor(for: id))
                                .frame(width: 6, height: 6)
                            Text(Theme.streamLabel(for: id))
                                .font(.custom("DMSans-Medium", size: 13))
                                .foregroundStyle(selectedId == id ? Theme.textPrimary : Theme.textMuted)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(selectedId == id ? Color.white.opacity(0.06) : Color.white.opacity(0.02))
                        .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func preMapFilters(_ config: ChannelConfig) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PRE-MAP FILTERS")
                .font(.custom("DMSans-Regular", size: 10))
                .tracking(1)
                .foregroundStyle(Theme.textWhisper)

            HStack(spacing: 10) {
                Stepper("Window: \(config.preMapWindow ?? 1)", value: Binding(
                    get: { config.preMapWindow ?? 1 },
                    set: { v in store.updateChannel(selectedId) { $0.preMapWindow = max(1, v) } }
                ), in: 1...20)
                .font(.custom("DMSans-Regular", size: 11))
                .foregroundStyle(Theme.textMuted)

                Picker("Statistic", selection: Binding(
                    get: { config.preMapStatistic ?? .mean },
                    set: { v in store.updateChannel(selectedId) { $0.preMapStatistic = v } }
                )) {
                    Text("mean").tag(ChannelConfig.PreMapStatistic.mean)
                    Text("median").tag(ChannelConfig.PreMapStatistic.median)
                }
                .pickerStyle(.menu)
            }

            sliderRow("Change Threshold", value: config.preMapChangeThreshold ?? 0, range: 0...10, step: 0.01) { v in
                store.updateChannel(selectedId) { $0.preMapChangeThreshold = v }
            }
            sliderRow("Percentile Clamp", value: config.preMapPercentileClamp ?? 100, range: 50...100, step: 1) { v in
                store.updateChannel(selectedId) { $0.preMapPercentileClamp = v }
            }

            Toggle("Derivative", isOn: Binding(
                get: { config.preMapDerivative ?? false },
                set: { v in store.updateChannel(selectedId) { $0.preMapDerivative = v } }
            ))
            .font(.custom("DMSans-Regular", size: 12))
            .foregroundStyle(Theme.textMuted)
            .tint(Theme.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func mappingCard(index: Int, mapping: SonificationMapping) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Row \(index + 1)")
                    .font(.custom("DMSans-Medium", size: 11))
                    .foregroundStyle(Theme.textWhisper)
                Spacer()
                Button {
                    removeMapping(index)
                } label: {
                    Text("Remove")
                        .font(.custom("DMSans-Medium", size: 10))
                        .foregroundStyle(Color.red.opacity(0.9))
                }
            }

            HStack(spacing: 10) {
                Picker("Source", selection: Binding(
                    get: { mapping.sourceField },
                    set: { v in updateMapping(index, sourceField: v) }
                )) {
                    ForEach(sourceFields, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)

                Picker("Target", selection: Binding(
                    get: { mapping.targetParam },
                    set: { v in updateMapping(index, targetParam: v) }
                )) {
                    ForEach(targetOptions, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
            }

            HStack(spacing: 10) {
                Picker("Curve", selection: Binding(
                    get: { mapping.curve },
                    set: { v in updateMapping(index, curve: v) }
                )) {
                    Text("linear").tag(SonificationMapping.CurveType.linear)
                    Text("log").tag(SonificationMapping.CurveType.log)
                    Text("exp").tag(SonificationMapping.CurveType.exp)
                    Text("step").tag(SonificationMapping.CurveType.step)
                }
                .pickerStyle(.segmented)

                Toggle("Invert", isOn: Binding(
                    get: { mapping.invert },
                    set: { v in updateMapping(index, invert: v) }
                ))
                .font(.custom("DMSans-Regular", size: 11))
                .foregroundStyle(Theme.textMuted)
                .tint(Theme.accent)
            }

            rangeEditor(
                label: "Input Range",
                minValue: mapping.inputRange.first ?? 0,
                maxValue: mapping.inputRange.dropFirst().first ?? 100
            ) { minV, maxV in
                updateMapping(index, inputRange: [minV, maxV])
            }

            rangeEditor(
                label: "Output Range",
                minValue: mapping.outputRange.first ?? 0,
                maxValue: mapping.outputRange.dropFirst().first ?? 1
            ) { minV, maxV in
                updateMapping(index, outputRange: [minV, maxV])
            }

            sliderRow("Smoothing (ms)", value: mapping.smoothingMs ?? 0, range: 0...5000, step: 10) { v in
                updateMapping(index, smoothingMs: v)
            }
            sliderRow("Quantize Step", value: mapping.quantizeStep ?? 0, range: 0...4, step: 0.01) { v in
                updateMapping(index, quantizeStep: v)
            }
            sliderRow("Hysteresis", value: mapping.hysteresis ?? 0, range: 0...2, step: 0.01) { v in
                updateMapping(index, hysteresis: v)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func rangeEditor(
        label: String,
        minValue: Double,
        maxValue: Double,
        onSet: @escaping (Double, Double) -> Void
    ) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.custom("DMSans-Regular", size: 10))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 72, alignment: .leading)
            TextField("min", value: Binding(
                get: { minValue },
                set: { v in onSet(v, maxValue) }
            ), format: .number)
            .textFieldStyle(.roundedBorder)
            .font(.custom("SpaceGrotesk-Regular", size: 11))
            TextField("max", value: Binding(
                get: { maxValue },
                set: { v in onSet(minValue, v) }
            ), format: .number)
            .textFieldStyle(.roundedBorder)
            .font(.custom("SpaceGrotesk-Regular", size: 11))
        }
    }

    private func addMapping() {
        guard var cfg = config else { return }
        let next = SonificationMapping(
            sourceField: sourceFields.first ?? "value",
            targetParam: targetOptions.first ?? "frequency",
            inputRange: [0, 100],
            outputRange: [0, 1],
            curve: .linear,
            invert: false,
            smoothingMs: 0,
            quantizeStep: 0,
            hysteresis: 0
        )
        cfg.mappings.append(next)
        store.updateChannel(selectedId) { $0.mappings = cfg.mappings }
    }

    private func removeMapping(_ index: Int) {
        guard var cfg = config, cfg.mappings.indices.contains(index) else { return }
        cfg.mappings.remove(at: index)
        store.updateChannel(selectedId) { $0.mappings = cfg.mappings }
    }

    private func updateMapping(_ index: Int, sourceField: String? = nil, targetParam: String? = nil, inputRange: [Double]? = nil, outputRange: [Double]? = nil, curve: SonificationMapping.CurveType? = nil, invert: Bool? = nil, smoothingMs: Double? = nil, quantizeStep: Double? = nil, hysteresis: Double? = nil) {
        guard var cfg = config, cfg.mappings.indices.contains(index) else { return }
        var m = cfg.mappings[index]
        if let sourceField { m.sourceField = sourceField }
        if let targetParam { m.targetParam = targetParam }
        if let inputRange { m.inputRange = inputRange }
        if let outputRange { m.outputRange = outputRange }
        if let curve { m.curve = curve }
        if let invert { m.invert = invert }
        if let smoothingMs { m.smoothingMs = smoothingMs }
        if let quantizeStep { m.quantizeStep = quantizeStep }
        if let hysteresis { m.hysteresis = hysteresis }
        cfg.mappings[index] = m
        store.updateChannel(selectedId) { $0.mappings = cfg.mappings }
    }

    private func sliderRow(_ label: String, value: Double, range: ClosedRange<Double>, step: Double, onSet: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.custom("DMSans-Regular", size: 10))
                    .foregroundStyle(Theme.textMuted)
                Spacer()
                Text(value >= 100 ? String(format: "%.0f", value) : String(format: "%.2f", value))
                    .font(.custom("SpaceGrotesk-Regular", size: 11))
                    .foregroundStyle(Theme.textWhisper)
            }
            Slider(value: Binding(get: { value }, set: onSet), in: range, step: step)
                .tint(Theme.accent.opacity(0.75))
        }
    }
}
