"use client";

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { applyMappings } from '@/lib/mapping-engine';
import type { AudioEngine } from '@/lib/audio-engine';
import type { DataPoint } from '@/types/stream';
import type { BehaviorType, SonificationMapping, MappingCurve } from '@/types/sonification';

const CURVES: MappingCurve[] = ['linear', 'logarithmic', 'exponential', 'step'];

const KNOWN_SOURCE_FIELDS: Record<string, string[]> = {
  weather: ['temperature', 'feelsLike', 'clouds', 'humidity', 'windSpeed'],
  flights: ['distance', 'speed', 'altitude', 'frequency', 'lat', 'lon'],
  wikipedia: ['titleLength', 'lengthDelta', 'absLengthDelta'],
  rss: ['titleLength', 'contentLength', 'hasImage'],
  stocks: ['price', 'prevClose', 'changeFromClose', 'priceDelta', 'priceDeltaPct', 'direction', 'dayHigh', 'dayLow'],
};

type TargetOption = { value: string; label: string };
type MappingPreset = { id: string; name: string; description: string; mappings: SonificationMapping[] };
type FieldDiagnostics = { min: number; max: number; numericCount: number; missingCount: number };
type StreamDiagnostics = { samples: number; rateHz: number; fields: Record<string, FieldDiagnostics> };

const AMBIENT_TARGETS: TargetOption[] = [
  { value: 'frequency', label: 'Frequency' },
  { value: 'patternSelect', label: 'Pattern Select' },
  { value: 'noiseVolume', label: 'Noise Volume' },
  { value: 'pan', label: 'Pan' },
  { value: 'detune', label: 'Detune' },
];

const EVENT_TARGETS: TargetOption[] = [
  { value: 'scaleIndex', label: 'Scale Index' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'duration', label: 'Duration (s)' },
  { value: 'triggerProbability', label: 'Trigger Probability' },
  { value: 'filterCutoff', label: 'Filter Cutoff' },
  { value: 'pan', label: 'Pan' },
  { value: 'detune', label: 'Detune' },
];

const TARGET_HINTS: Record<string, string> = {
  frequency: 'Direct pitch/frequency control.',
  patternSelect: 'Selects ambient arpeggio variants.',
  noiseVolume: 'Adds/removes textural noise bed.',
  scaleIndex: 'Picks note index in current scale.',
  velocity: 'Note intensity/loudness.',
  duration: 'Event note length in seconds.',
  triggerProbability: 'Chance to trigger each event (0..1).',
  filterCutoff: 'Event/filter brightness.',
  pan: 'Stereo position (-1 left .. +1 right).',
  detune: 'Pitch offset in cents.',
};

const FIELD_HELP = {
  source: 'Source field is the incoming data value to read from the stream.',
  target: 'Target is the sound parameter this row controls.',
  curve: 'Curve changes response feel: linear=direct, log=more sensitive low-end, exp=more sensitive high-end, step=discrete.',
  invert: 'Invert flips the mapping direction (high input -> low output).',
  inputRange: 'Input range clamps and normalizes source values before mapping.',
  outputRange: 'Output range sets the min/max value sent to the target parameter.',
  smooth: 'Smooth ms applies per-row glide over time to reduce jitter.',
  quantize: 'Quantize snaps output to fixed steps (0 disables).',
  hysteresis: 'Hysteresis ignores tiny changes until they exceed this threshold.',
};

function pickField(sourceFields: string[], fallback: string[]): string {
  const fromKnown = fallback.find((f) => sourceFields.includes(f));
  return fromKnown ?? sourceFields[0] ?? 'value';
}

function smartPresetsFor(streamId: string, behaviorType: BehaviorType, sourceFields: string[]): MappingPreset[] {
  const ambient: MappingPreset = {
    id: 'ambient-readable',
    name: 'Ambient Readable',
    description: 'Slow stable bed: pitch + texture + stereo drift.',
    mappings: [
      {
        sourceField: pickField(sourceFields, ['feelsLike', 'temperature', 'price', 'altitude']),
        targetParam: 'frequency',
        curve: 'logarithmic',
        inputRange: [0, 100],
        outputRange: [120, 520],
        invert: false,
        smoothingMs: 1200,
        quantizeStep: 0,
        hysteresis: 3,
      },
      {
        sourceField: pickField(sourceFields, ['clouds', 'humidity', 'absLengthDelta']),
        targetParam: 'noiseVolume',
        curve: 'linear',
        inputRange: [0, 100],
        outputRange: [-58, -20],
        invert: false,
        smoothingMs: 1000,
        quantizeStep: 1,
        hysteresis: 1,
      },
      {
        sourceField: pickField(sourceFields, ['windSpeed', 'speed', 'priceDeltaPct']),
        targetParam: 'pan',
        curve: 'linear',
        inputRange: [0, 50],
        outputRange: [-0.6, 0.6],
        invert: false,
        smoothingMs: 1400,
        quantizeStep: 0.05,
        hysteresis: 0.02,
      },
    ],
  };

  const event: MappingPreset = {
    id: 'event-readable',
    name: 'Event Readable',
    description: 'Clear event notes with fewer accidental triggers.',
    mappings: [
      {
        sourceField: pickField(sourceFields, ['titleLength', 'direction', 'priceDeltaPct', 'lengthDelta']),
        targetParam: 'scaleIndex',
        curve: 'step',
        inputRange: [0, 100],
        outputRange: [0, 10],
        invert: false,
        smoothingMs: 0,
        quantizeStep: 1,
        hysteresis: 0.5,
      },
      {
        sourceField: pickField(sourceFields, ['absLengthDelta', 'contentLength', 'priceDeltaPct', 'speed']),
        targetParam: 'velocity',
        curve: 'exponential',
        inputRange: [0, 500],
        outputRange: [0.2, 0.95],
        invert: false,
        smoothingMs: 120,
        quantizeStep: 0.05,
        hysteresis: 0.04,
      },
      {
        sourceField: pickField(sourceFields, ['absLengthDelta', 'priceDeltaPct', 'windSpeed']),
        targetParam: 'triggerProbability',
        curve: 'linear',
        inputRange: [0, 100],
        outputRange: [0.2, 0.95],
        invert: false,
        smoothingMs: 120,
        quantizeStep: 0.05,
        hysteresis: 0.03,
      },
    ],
  };

  const hybrid: MappingPreset = {
    id: 'hybrid-monitor',
    name: 'Hybrid Monitor',
    description: 'Ambient stability with event accents from notable changes.',
    mappings: [
      {
        sourceField: pickField(sourceFields, ['feelsLike', 'temperature', 'price', 'altitude']),
        targetParam: 'frequency',
        curve: 'linear',
        inputRange: [0, 100],
        outputRange: [140, 640],
        invert: false,
        smoothingMs: 1000,
        quantizeStep: 0,
        hysteresis: 2,
      },
      {
        sourceField: pickField(sourceFields, ['clouds', 'humidity', 'absLengthDelta']),
        targetParam: 'patternSelect',
        curve: 'step',
        inputRange: [0, 100],
        outputRange: [0, 2],
        invert: false,
        smoothingMs: 600,
        quantizeStep: 1,
        hysteresis: 0.5,
      },
      {
        sourceField: pickField(sourceFields, ['priceDeltaPct', 'absLengthDelta', 'windSpeed']),
        targetParam: 'triggerProbability',
        curve: 'linear',
        inputRange: [0, 100],
        outputRange: [0.1, 0.9],
        invert: false,
        smoothingMs: 120,
        quantizeStep: 0.05,
        hysteresis: 0.03,
      },
    ],
  };

  if (behaviorType === 'ambient') return [ambient];
  if (behaviorType === 'event') return [event];
  const weatherExtra: MappingPreset = {
    id: 'weather-cinematic',
    name: 'Weather Cinematic',
    description: 'Weather-specific: cloud texture + wind-driven motion + sparse accents.',
    mappings: [
      {
        sourceField: pickField(sourceFields, ['feelsLike', 'temperature']),
        targetParam: 'frequency',
        curve: 'logarithmic',
        inputRange: [0, 100],
        outputRange: [110, 460],
        invert: false,
        smoothingMs: 1600,
        quantizeStep: 0,
        hysteresis: 2,
      },
      {
        sourceField: pickField(sourceFields, ['clouds']),
        targetParam: 'noiseVolume',
        curve: 'linear',
        inputRange: [0, 100],
        outputRange: [-60, -18],
        invert: false,
        smoothingMs: 1500,
        quantizeStep: 1,
        hysteresis: 1,
      },
      {
        sourceField: pickField(sourceFields, ['windSpeed']),
        targetParam: 'triggerProbability',
        curve: 'linear',
        inputRange: [0, 40],
        outputRange: [0.08, 0.75],
        invert: false,
        smoothingMs: 200,
        quantizeStep: 0.05,
        hysteresis: 0.03,
      },
    ],
  };

  return streamId === 'weather' ? [hybrid, weatherExtra] : [hybrid];
}

function targetOptionsForBehavior(behaviorType: BehaviorType): TargetOption[] {
  if (behaviorType === 'ambient') return AMBIENT_TARGETS;
  if (behaviorType === 'event') return EVENT_TARGETS;
  const merged = [...AMBIENT_TARGETS.map((t) => ({ ...t, label: `Ambient: ${t.label}` })), ...EVENT_TARGETS.map((t) => ({ ...t, label: `Event: ${t.label}` }))];
  const dedup = new Map<string, TargetOption>();
  for (const option of merged) {
    if (!dedup.has(option.value)) dedup.set(option.value, option);
  }
  return [...dedup.values()];
}

function safeRange(min: number, max: number, fallback: [number, number]): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

function sourceRange(
  diagnostics: StreamDiagnostics,
  field: string,
  fallback: [number, number] = [0, 100]
): [number, number] {
  const d = diagnostics.fields[field];
  if (!d || d.numericCount < 2) return fallback;
  return safeRange(d.min, d.max, fallback);
}

function candidateNumericFields(sourceFields: string[], diagnostics: StreamDiagnostics): string[] {
  return sourceFields
    .filter((f) => {
      const d = diagnostics.fields[f];
      return Boolean(d && d.numericCount >= 2);
    })
    .sort((a, b) => {
      const da = diagnostics.fields[a];
      const db = diagnostics.fields[b];
      const spanA = da ? da.max - da.min : 0;
      const spanB = db ? db.max - db.min : 0;
      return spanB - spanA;
    });
}

function suggestMappingsFromDiagnostics(
  behaviorType: BehaviorType,
  sourceFields: string[],
  diagnostics: StreamDiagnostics
): SonificationMapping[] {
  const numeric = candidateNumericFields(sourceFields, diagnostics);
  const p0 = numeric[0] ?? sourceFields[0] ?? 'value';
  const p1 = numeric[1] ?? numeric[0] ?? p0;
  const p2 = numeric[2] ?? numeric[1] ?? p1;

  if (behaviorType === 'ambient') {
    return [
      {
        sourceField: p0,
        targetParam: 'frequency',
        curve: 'logarithmic',
        inputRange: sourceRange(diagnostics, p0),
        outputRange: [120, 540],
        invert: false,
        smoothingMs: 1200,
        quantizeStep: 0,
        hysteresis: 0.5,
      },
      {
        sourceField: p1,
        targetParam: 'noiseVolume',
        curve: 'linear',
        inputRange: sourceRange(diagnostics, p1),
        outputRange: [-60, -18],
        invert: false,
        smoothingMs: 1000,
        quantizeStep: 1,
        hysteresis: 0.25,
      },
      {
        sourceField: p2,
        targetParam: 'pan',
        curve: 'linear',
        inputRange: sourceRange(diagnostics, p2),
        outputRange: [-0.6, 0.6],
        invert: false,
        smoothingMs: 1200,
        quantizeStep: 0.05,
        hysteresis: 0.02,
      },
    ];
  }

  if (behaviorType === 'event') {
    return [
      {
        sourceField: p0,
        targetParam: 'scaleIndex',
        curve: 'step',
        inputRange: sourceRange(diagnostics, p0),
        outputRange: [0, 10],
        invert: false,
        smoothingMs: 0,
        quantizeStep: 1,
        hysteresis: 0.5,
      },
      {
        sourceField: p1,
        targetParam: 'velocity',
        curve: 'exponential',
        inputRange: sourceRange(diagnostics, p1),
        outputRange: [0.2, 0.95],
        invert: false,
        smoothingMs: 120,
        quantizeStep: 0.05,
        hysteresis: 0.04,
      },
      {
        sourceField: p2,
        targetParam: 'triggerProbability',
        curve: 'linear',
        inputRange: sourceRange(diagnostics, p2),
        outputRange: [0.15, 0.9],
        invert: false,
        smoothingMs: 120,
        quantizeStep: 0.05,
        hysteresis: 0.03,
      },
    ];
  }

  return [
    {
      sourceField: p0,
      targetParam: 'frequency',
      curve: 'linear',
      inputRange: sourceRange(diagnostics, p0),
      outputRange: [140, 620],
      invert: false,
      smoothingMs: 1000,
      quantizeStep: 0,
      hysteresis: 0.5,
    },
    {
      sourceField: p1,
      targetParam: 'patternSelect',
      curve: 'step',
      inputRange: sourceRange(diagnostics, p1),
      outputRange: [0, 2],
      invert: false,
      smoothingMs: 600,
      quantizeStep: 1,
      hysteresis: 0.5,
    },
    {
      sourceField: p2,
      targetParam: 'triggerProbability',
      curve: 'linear',
      inputRange: sourceRange(diagnostics, p2),
      outputRange: [0.1, 0.85],
      invert: false,
      smoothingMs: 140,
      quantizeStep: 0.05,
      hysteresis: 0.03,
    },
  ];
}

export default function MappingEditor({ engine }: { engine: AudioEngine | null }) {
  const channels = useStore((s) => s.channels);
  const selectedId = useStore((s) => s.selectedChannelId);
  const global = useStore((s) => s.global);
  const updateChannel = useStore((s) => s.updateChannel);
  const [liveValues, setLiveValues] = useState<Partial<Record<string, number>>>({});
  const [liveInput, setLiveInput] = useState<Record<string, number | string | boolean>>({});
  const [diagnostics, setDiagnostics] = useState<StreamDiagnostics>({ samples: 0, rateHz: 0, fields: {} });
  const activeIdRef = useRef<string | null>(null);
  const previewMappingStateRef = useRef<Map<string, { lastOutput: number; lastUpdatedMs: number }>>(new Map());
  const timestampHistoryRef = useRef<number[]>([]);

  const channelIds = Object.keys(channels);
  const activeId = selectedId && channels[selectedId] ? selectedId : channelIds[0];
  const config = channels[activeId];

  // Register data listener for live preview
  useEffect(() => {
    activeIdRef.current = activeId;
    if (!engine || !activeId) return;

    const listenerId = 'mapping-preview';
    const handler = (data: DataPoint) => {
      // Only preview data for the currently selected stream
      const currentActiveId = activeIdRef.current;
      if (!currentActiveId || data.streamId !== currentActiveId) return;
      const currentConfig = useStore.getState().channels[currentActiveId];
      const currentGlobal = useStore.getState().global;
      if (!currentConfig) return;
      const mapped = applyMappings(data, currentConfig.mappings, currentGlobal, {
        state: previewMappingStateRef.current,
        stateKeyPrefix: `preview:${currentActiveId}`,
        nowMs: data.timestamp,
      });
      setLiveValues(mapped);
      const fields: Record<string, number | string | boolean> = {};
      for (const [k, v] of Object.entries(data.fields)) {
        fields[k] = v;
      }
      setLiveInput(fields);

      const times = timestampHistoryRef.current;
      times.push(data.timestamp);
      while (times.length > 40) times.shift();
      let rateHz = 0;
      if (times.length >= 2) {
        const spanMs = Math.max(1, times[times.length - 1] - times[0]);
        rateHz = ((times.length - 1) * 1000) / spanMs;
      }

      setDiagnostics((prev) => {
        const nextFields: Record<string, FieldDiagnostics> = { ...prev.fields };
        const seen = new Set<string>();
        for (const [k, v] of Object.entries(data.fields)) {
          seen.add(k);
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            const ex = nextFields[k] ?? { min: 0, max: 0, numericCount: 0, missingCount: 0 };
            nextFields[k] = { ...ex, missingCount: ex.missingCount + 1 };
            continue;
          }
          const ex = nextFields[k];
          if (!ex) {
            nextFields[k] = { min: v, max: v, numericCount: 1, missingCount: 0 };
          } else {
            nextFields[k] = {
              min: Math.min(ex.min, v),
              max: Math.max(ex.max, v),
              numericCount: ex.numericCount + 1,
              missingCount: ex.missingCount,
            };
          }
        }
        const knownFields = KNOWN_SOURCE_FIELDS[currentActiveId] ?? [];
        for (const k of knownFields) {
          if (!seen.has(k)) {
            const ex = nextFields[k] ?? { min: 0, max: 0, numericCount: 0, missingCount: 0 };
            nextFields[k] = { ...ex, missingCount: ex.missingCount + 1 };
          }
        }
        return {
          samples: prev.samples + 1,
          rateHz,
          fields: nextFields,
        };
      });
    };

    engine.onData(listenerId, handler, '*');

    return () => {
      engine.offData(listenerId);
    };
  }, [engine, activeId]);

  useEffect(() => {
    previewMappingStateRef.current.clear();
    timestampHistoryRef.current = [];
    setLiveValues({});
    setLiveInput({});
    setDiagnostics({ samples: 0, rateHz: 0, fields: {} });
  }, [activeId]);

  if (!config) return null;

  const mappings = [...config.mappings];
  const behaviorType: BehaviorType = config.behaviorType ?? 'event';
  const targetOptions = targetOptionsForBehavior(behaviorType);
  const sourceFields = KNOWN_SOURCE_FIELDS[activeId] ?? [];
  const presets = smartPresetsFor(activeId, behaviorType, sourceFields);
  const preMapWindow = Math.max(1, Math.floor(config.preMapWindow ?? 1));
  const preMapStatistic = config.preMapStatistic ?? 'mean';
  const preMapChangeThreshold = Math.max(0, config.preMapChangeThreshold ?? 0);
  const preMapDerivative = config.preMapDerivative ?? false;
  const preMapPercentileClamp = Math.max(50, Math.min(100, config.preMapPercentileClamp ?? 100));
  const canSuggestFromLive = diagnostics.samples >= 5;

  const addMapping = () => {
    const newMapping: SonificationMapping = {
      sourceField: sourceFields[0] ?? 'value',
      targetParam: targetOptions[0]?.value ?? 'frequency',
      curve: 'linear',
      inputRange: [0, 100],
      outputRange: [0, 1],
      invert: false,
      smoothingMs: 0,
      quantizeStep: 0,
      hysteresis: 0,
    };
    updateChannel(activeId, { mappings: [...mappings, newMapping] });
  };

  const removeMapping = (index: number) => {
    updateChannel(activeId, { mappings: mappings.filter((_, i) => i !== index) });
  };

  const updateMapping = (index: number, partial: Partial<SonificationMapping>) => {
    const next = mappings.map((m, i) => (i === index ? { ...m, ...partial } : m));
    updateChannel(activeId, { mappings: next });
  };

  const applyPreset = (preset: MappingPreset) => {
    updateChannel(activeId, { mappings: preset.mappings });
  };

  const applySuggestedMappings = () => {
    const next = suggestMappingsFromDiagnostics(behaviorType, sourceFields, diagnostics);
    updateChannel(activeId, { mappings: next });
  };

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <div className="panel-title !mb-0">
          Mappings <span style={{ color: 'var(--text-muted)' }}>({activeId})</span>
        </div>
        <button
          onClick={addMapping}
          className="text-[10px] px-2 py-0.5 rounded bg-[#333] text-gray-400 hover:text-gray-200"
        >
          + Add
        </button>
      </div>
      <div className="text-[10px] text-gray-500 mb-2">
        Target set: <span className="font-mono">{behaviorType}</span>
      </div>
      <div className="mb-2 p-2 rounded" style={{ background: '#252525' }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[10px] text-gray-400">Stream Diagnostics</div>
          <button
            onClick={applySuggestedMappings}
            disabled={!canSuggestFromLive}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[#333] text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
            title={canSuggestFromLive ? 'Generate mappings from observed field ranges.' : 'Need at least 5 samples first.'}
          >
            Suggest From Live Data
          </button>
        </div>
        <div className="text-[9px] text-gray-500 mb-1">
          Update rate: {diagnostics.rateHz.toFixed(2)} Hz • Samples: {diagnostics.samples}
        </div>
        <div className="space-y-0.5">
          {sourceFields.slice(0, 5).map((field) => {
            const d = diagnostics.fields[field];
            const missingPct = diagnostics.samples > 0
              ? Math.round(((d?.missingCount ?? diagnostics.samples) / diagnostics.samples) * 100)
              : 0;
            return (
              <div key={field} className="text-[9px] text-gray-500 flex justify-between gap-2">
                <span>{field}</span>
                <span className="font-mono">
                  {d && d.numericCount > 0
                    ? `${d.min.toFixed(2)}..${d.max.toFixed(2)}`
                    : 'no numeric data'}
                  {' • '}
                  miss {missingPct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mb-2 p-2 rounded" style={{ background: '#252525' }}>
        <div className="text-[10px] text-gray-400 mb-1">Pre-Map Filters</div>
        <div className="text-[9px] text-gray-500 mb-1">
          Applied before mapping to reduce noise and control sensitivity.
        </div>
        <div className="grid grid-cols-2 gap-2 mb-1.5">
          <div>
            <div className="text-[9px] text-gray-500 mb-0.5">Rolling Window</div>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={preMapWindow}
              onChange={(e) => updateChannel(activeId, { preMapWindow: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
              style={{ background: '#333', color: '#ddd', border: 'none' }}
            />
          </div>
          <div>
            <div className="text-[9px] text-gray-500 mb-0.5">Change Threshold</div>
            <input
              type="number"
              min={0}
              step={0.01}
              value={preMapChangeThreshold}
              onChange={(e) => updateChannel(activeId, { preMapChangeThreshold: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
              style={{ background: '#333', color: '#ddd', border: 'none' }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-1.5">
          <div>
            <div className="text-[9px] text-gray-500 mb-0.5">Clamp Percentile</div>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={preMapPercentileClamp}
              onChange={(e) => updateChannel(activeId, { preMapPercentileClamp: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: '#888' }}
            />
            <div className="text-[9px] text-gray-500 font-mono">{preMapPercentileClamp}% (100 = off)</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 mb-0.5">Statistic</div>
            <div className="flex gap-1">
              {(['mean', 'median'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => updateChannel(activeId, { preMapStatistic: s })}
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{
                    background: preMapStatistic === s ? '#555' : '#333',
                    color: preMapStatistic === s ? '#fff' : '#777',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <label className="text-[9px] text-gray-400 inline-flex items-center gap-1 mt-1">
              <input
                type="checkbox"
                checked={preMapDerivative}
                onChange={(e) => updateChannel(activeId, { preMapDerivative: e.target.checked })}
              />
              Derivative mode (use change, not absolute)
            </label>
          </div>
        </div>
      </div>
      <div className="mb-2 p-2 rounded" style={{ background: '#252525' }}>
        <div className="text-[10px] text-gray-400 mb-1">Field Guide</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.source}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.target}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.curve}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.inputRange}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.outputRange}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.smooth}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.quantize}</div>
        <div className="text-[9px] text-gray-500">{FIELD_HELP.hysteresis}</div>
      </div>
      <div className="mb-2 p-2 rounded" style={{ background: '#252525' }}>
        <div className="text-[10px] text-gray-400 mb-1">Smart Presets</div>
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="text-[10px] px-2 py-1 rounded bg-[#333] text-gray-300 hover:text-white"
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div className="text-[9px] text-gray-500 mt-1">
          {presets[0]?.description ?? 'Preset mappings choose readable defaults for this stream/behavior.'}
        </div>
      </div>

      {mappings.map((m, i) => {
        const inputVal = liveInput[m.sourceField];
        const outputVal = liveValues[m.targetParam];

        return (
          <div key={i} className="mb-2 p-2 rounded" style={{ background: '#2a2a2a' }}>
            <div className="flex items-center gap-1 mb-1.5">
              {/* Source field */}
              <select
                value={m.sourceField}
                onChange={(e) => updateMapping(i, { sourceField: e.target.value })}
                className="text-[11px] rounded px-1 py-0.5 flex-1"
                style={{ background: '#333', color: '#ddd', border: 'none' }}
              >
                {sourceFields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>

              <span className="text-[10px] text-gray-500">→</span>

              {/* Target param */}
              <select
                value={m.targetParam}
                onChange={(e) => updateMapping(i, { targetParam: e.target.value })}
                className="text-[11px] rounded px-1 py-0.5 flex-1"
                style={{ background: '#333', color: '#ddd', border: 'none' }}
              >
                {!targetOptions.some((opt) => opt.value === m.targetParam) && (
                  <option value={m.targetParam}>
                    Legacy: {m.targetParam}
                  </option>
                )}
                {targetOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>

              <button
                onClick={() => removeMapping(i)}
                className="text-[10px] text-red-400 hover:text-red-300 px-1"
              >✕</button>
            </div>

            {/* Live preview */}
            {(inputVal !== undefined || outputVal !== undefined) && (
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <span className="text-[9px] font-mono text-cyan-400">
                  {typeof inputVal === 'number' ? inputVal.toFixed(2) : String(inputVal ?? '—')}
                </span>
                <span className="text-[9px] text-gray-600">→</span>
                <span className="text-[9px] font-mono text-green-400">
                  {outputVal !== undefined ? outputVal.toFixed(3) : '—'}
                </span>
              </div>
            )}
            <div className="text-[9px] text-gray-500 px-1 mb-1">
              {TARGET_HINTS[m.targetParam] ?? 'Mapped output parameter.'}
            </div>

            {/* Curve */}
            <div className="flex gap-1 mb-1.5">
              {CURVES.map((c) => (
                <button
                  key={c}
                  onClick={() => updateMapping(i, { curve: c })}
                  className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: m.curve === c ? '#555' : '#333',
                    color: m.curve === c ? '#fff' : '#666',
                  }}
                >
                  {c}
                </button>
              ))}
              <button
                onClick={() => updateMapping(i, { invert: !m.invert })}
                className="text-[9px] px-1.5 py-0.5 rounded ml-auto"
                style={{
                  background: m.invert ? '#6366f1' : '#333',
                  color: m.invert ? '#fff' : '#666',
                }}
              >
                inv
              </button>
            </div>
            <div className="text-[9px] text-gray-500 px-1 mb-1">{FIELD_HELP.curve}</div>

            {/* Ranges */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] text-gray-500 mb-0.5">Input Range</div>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={m.inputRange[0]}
                    onChange={(e) => updateMapping(i, { inputRange: [parseFloat(e.target.value) || 0, m.inputRange[1]] })}
                    className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                    style={{ background: '#333', color: '#ddd', border: 'none' }}
                  />
                  <input
                    type="number"
                    value={m.inputRange[1]}
                    onChange={(e) => updateMapping(i, { inputRange: [m.inputRange[0], parseFloat(e.target.value) || 100] })}
                    className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                    style={{ background: '#333', color: '#ddd', border: 'none' }}
                  />
                </div>
              </div>
              <div>
                <div className="text-[9px] text-gray-500 mb-0.5">Output Range</div>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={m.outputRange[0]}
                    onChange={(e) => updateMapping(i, { outputRange: [parseFloat(e.target.value) || 0, m.outputRange[1]] })}
                    className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                    style={{ background: '#333', color: '#ddd', border: 'none' }}
                  />
                  <input
                    type="number"
                    value={m.outputRange[1]}
                    onChange={(e) => updateMapping(i, { outputRange: [m.outputRange[0], parseFloat(e.target.value) || 1] })}
                    className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                    style={{ background: '#333', color: '#ddd', border: 'none' }}
                  />
                </div>
              </div>
            </div>
            <div className="text-[9px] text-gray-500 px-1 mt-1">
              {FIELD_HELP.inputRange} {FIELD_HELP.outputRange}
            </div>

            {/* Row shaping */}
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              <div>
                <div className="text-[9px] text-gray-500 mb-0.5">Smooth ms</div>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={m.smoothingMs ?? 0}
                  onChange={(e) => updateMapping(i, { smoothingMs: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
              </div>
              <div>
                <div className="text-[9px] text-gray-500 mb-0.5">Quantize</div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={m.quantizeStep ?? 0}
                  onChange={(e) => updateMapping(i, { quantizeStep: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
              </div>
              <div>
                <div className="text-[9px] text-gray-500 mb-0.5">Hysteresis</div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={m.hysteresis ?? 0}
                  onChange={(e) => updateMapping(i, { hysteresis: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
              </div>
            </div>
            <div className="text-[9px] text-gray-500 px-1 mt-1">
              {FIELD_HELP.smooth} {FIELD_HELP.quantize} {FIELD_HELP.hysteresis}
            </div>
          </div>
        );
      })}

      {mappings.length === 0 && (
        <div className="text-[11px] text-gray-600 text-center py-2">
          No mappings. Click + Add to create one.
        </div>
      )}
    </div>
  );
}
