"use client";

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import type { ChannelConfig, GlobalConfig } from '@/types/sonification';
import { ALL_DEFAULT_CHANNELS } from '@/streams/defaults';
import { normalizeSingleActiveChannels } from '@/lib/preset-utils';

interface SavedPreset {
  name: string;
  channels: Record<string, ChannelConfig>;
  global: GlobalConfig;
  savedAt: number;
}

interface BuiltinPreset {
  id: string;
  name: string;
  description: string;
  signalPlan: string;
  tags: string[];
  cpuCost: 'low' | 'medium' | 'high';
  channels: Record<string, ChannelConfig>;
  global: GlobalConfig;
}

const STORAGE_KEY = 'streamscapes-presets';

function loadPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: SavedPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function stableStringify(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize(obj[key]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

function stateSignature(channels: Record<string, ChannelConfig>, global: GlobalConfig): string {
  return stableStringify({ channels, global });
}

function cloneDefaultChannels(): Record<string, ChannelConfig> {
  const clones = JSON.parse(JSON.stringify(ALL_DEFAULT_CHANNELS)) as ChannelConfig[];
  return Object.fromEntries(clones.map((ch) => [ch.streamId, ch]));
}

function buildBuiltinPresets(): BuiltinPreset[] {
  const makeGlobal = (global: Partial<GlobalConfig>): GlobalConfig => ({
    rootNote: 'C4',
    scale: 'major pentatonic',
    tempo: 120,
    masterVolume: 0,
    ...global,
  });

  const withPatch = (
    base: Record<string, ChannelConfig>,
    streamId: string,
    patch: Partial<ChannelConfig>
  ): Record<string, ChannelConfig> => ({
    ...base,
    [streamId]: { ...base[streamId], ...patch },
  });

  // 1) Ghostly Choir
  {
    const base = cloneDefaultChannels();
    let channels = withPatch(base, 'weather', {
      enabled: true,
      synthType: 'AMSynth',
      mode: 'pattern',
      volume: -8,
      effects: [
        { type: 'reverb', wet: 0.65, bypass: false, params: { decay: 6, preDelay: 0.03 } },
        { type: 'chorus', wet: 0.35, bypass: false, params: { frequency: 0.8, depth: 0.5, delayTime: 3.2 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.6, decay: 1.2, sustain: 0.75, release: 2.5 },
      },
    });
    channels = withPatch(channels, 'flights', { enabled: false });
    channels = withPatch(channels, 'wikipedia', { enabled: false });
    channels = withPatch(channels, 'rss', { enabled: false });
    channels = withPatch(channels, 'stocks', { enabled: false });
    const ghostly = {
      id: 'ghostly-choir',
      name: 'Ghostly Choir',
      description: 'Slow, airy weather harmonies with deep reverb and chorus.',
      signalPlan: 'weather (ambient)',
      tags: ['ambient', 'cinematic', 'long-listen'],
      cpuCost: 'medium' as const,
      channels,
      global: makeGlobal({ tempo: 62, scale: 'minor pentatonic', rootNote: 'D4', masterVolume: -2 }),
    };

    // 2) Plinky (Wood)
    const base2 = cloneDefaultChannels();
    let channels2 = withPatch(base2, 'weather', {
      enabled: true,
      synthType: 'PluckSynth',
      mode: 'pattern',
      volume: -10,
      effects: [{ type: 'delay', wet: 0.18, bypass: false, params: { delayTime: 0.18, feedback: 0.25 } }],
      synthOptions: {},
    });
    channels2 = withPatch(channels2, 'wikipedia', {
      enabled: true,
      synthType: 'Synth',
      volume: -15,
      effects: [],
      synthOptions: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.08 },
      },
    });
    channels2 = withPatch(channels2, 'flights', { enabled: false });
    channels2 = withPatch(channels2, 'rss', { enabled: false });
    channels2 = withPatch(channels2, 'stocks', { enabled: false });
    const plinkyWood = {
      id: 'plinky-wood',
      name: 'Plinky (Wood)',
      description: 'Col legno / woodpluck texture with tiny chime accents.',
      signalPlan: 'weather (ambient), wikipedia (event)',
      tags: ['percussive', 'light', 'mixed'],
      cpuCost: 'low' as const,
      channels: channels2,
      global: makeGlobal({ tempo: 120, scale: 'major pentatonic', rootNote: 'C5', masterVolume: -4 }),
    };

    // 2b) Music Box (Tonal)
    const base2b = cloneDefaultChannels();
    let channels2b = withPatch(base2b, 'weather', {
      enabled: true,
      synthType: 'Synth',
      mode: 'pattern',
      volume: -9,
      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 900, Q: 0.8 } },
        { type: 'reverb', wet: 0.16, bypass: false, params: { decay: 2.4, preDelay: 0.01 } },
        { type: 'delay', wet: 0.12, bypass: false, params: { delayTime: 0.14, feedback: 0.18 } },
      ],
      synthOptions: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.003, decay: 0.18, sustain: 0.02, release: 0.12 },
      },
    });
    channels2b = withPatch(channels2b, 'wikipedia', {
      enabled: true,
      synthType: 'Synth',
      volume: -17,
      effects: [],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.14, sustain: 0.03, release: 0.1 },
      },
    });
    channels2b = withPatch(channels2b, 'flights', { enabled: false });
    channels2b = withPatch(channels2b, 'rss', { enabled: false });
    channels2b = withPatch(channels2b, 'stocks', { enabled: false });
    const musicBoxTonal = {
      id: 'music-box-tonal',
      name: 'Music Box (Tonal)',
      description: 'Bell-like tuned plinks with cleaner pitch center.',
      signalPlan: 'weather (ambient), wikipedia (event)',
      tags: ['tonal', 'delicate', 'mixed'],
      cpuCost: 'medium' as const,
      channels: channels2b,
      global: makeGlobal({ tempo: 116, scale: 'major pentatonic', rootNote: 'C5', masterVolume: -4 }),
    };

    // 3) Distant Drone
    const base3 = cloneDefaultChannels();
    let channels3 = withPatch(base3, 'flights', {
      enabled: true,
      synthType: 'FMSynth',
      mode: 'continuous',
      volume: -12,
      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 1400, Q: 0.7 } },
        { type: 'reverb', wet: 0.45, bypass: false, params: { decay: 4.2, preDelay: 0.02 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 1.5, decay: 0.8, sustain: 0.9, release: 3.0 },
      },
    });
    channels3 = withPatch(channels3, 'weather', {
      enabled: true,
      behaviorType: 'ambient',
      ambientMode: 'sustain',
      mode: 'continuous',
      synthType: 'AMSynth',
      volume: -13,
      smoothingMs: 1600,
      effects: [
        { type: 'reverb', wet: 0.35, bypass: false, params: { decay: 5.2, preDelay: 0.03 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 1.2, decay: 0.7, sustain: 0.85, release: 2.8 },
      },
    });
    channels3 = withPatch(channels3, 'wikipedia', { enabled: false });
    channels3 = withPatch(channels3, 'rss', { enabled: false });
    channels3 = withPatch(channels3, 'stocks', { enabled: false });
    const drone = {
      id: 'distant-drone',
      name: 'Distant Drone',
      description: 'Low evolving drones with a guaranteed ambient sustain bed.',
      signalPlan: 'flights (ambient), weather (ambient)',
      tags: ['drone', 'ambient', 'long-listen'],
      cpuCost: 'medium' as const,
      channels: channels3,
      global: makeGlobal({ tempo: 60, scale: 'minor', rootNote: 'A3', masterVolume: -4 }),
    };

    // 4) Rainy Neon
    const base4 = cloneDefaultChannels();
    let channels4 = withPatch(base4, 'weather', {
      enabled: true,
      synthType: 'Synth',
      volume: -8,
      effects: [
        { type: 'delay', wet: 0.3, bypass: false, params: { delayTime: 0.25, feedback: 0.4 } },
        { type: 'chorus', wet: 0.2, bypass: false, params: { frequency: 1.2, depth: 0.6, delayTime: 3.5 } },
      ],
      synthOptions: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.15, decay: 0.35, sustain: 0.5, release: 0.7 },
      },
    });
    channels4 = withPatch(channels4, 'rss', {
      enabled: true,
      synthType: 'PluckSynth',
      volume: -20,
      effects: [],
      synthOptions: {},
    });
    channels4 = withPatch(channels4, 'flights', { enabled: false });
    channels4 = withPatch(channels4, 'wikipedia', { enabled: false });
    channels4 = withPatch(channels4, 'stocks', { enabled: false });
    const rainy = {
      id: 'rainy-neon',
      name: 'Rainy Neon',
      description: 'Wet weather pulse with soft plucks in a moody dorian palette.',
      signalPlan: 'weather (ambient), rss (event)',
      tags: ['moody', 'rhythmic', 'mixed'],
      cpuCost: 'medium' as const,
      channels: channels4,
      global: makeGlobal({ tempo: 92, scale: 'dorian', rootNote: 'E4', masterVolume: -5 }),
    };

    // 5) Tense Pulse
    const base5 = cloneDefaultChannels();
    let channels5 = withPatch(base5, 'stocks', {
      enabled: true,
      synthType: 'MembraneSynth',
      volume: -5,
      behaviorType: 'event',
      eventCooldownMs: 120,
      effects: [
        { type: 'compressor', wet: 1, bypass: false, params: { threshold: -24, ratio: 6 } },
        { type: 'distortion', wet: 0.2, bypass: false, params: { distortion: 0.28 } },
      ],
      synthOptions: {},
    });
    channels5 = withPatch(channels5, 'weather', {
      enabled: true,
      synthType: 'AMSynth',
      mode: 'pattern',
      behaviorType: 'ambient',
      ambientMode: 'arpeggio',
      smoothingMs: 900,
      volume: -9,
      effects: [
        { type: 'delay', wet: 0.22, bypass: false, params: { delayTime: 0.125, feedback: 0.28 } },
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 1800, Q: 1.2 } },
      ],
      synthOptions: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.2, release: 0.18 },
      },
    });
    channels5 = withPatch(channels5, 'flights', { enabled: false });
    channels5 = withPatch(channels5, 'wikipedia', { enabled: false });
    channels5 = withPatch(channels5, 'rss', { enabled: false });
    const tense = {
      id: 'tense-pulse',
      name: '8-Bit Scatter',
      description: 'Chippy, irregular digital blips over a tense synthetic bed.',
      signalPlan: 'weather (ambient), stocks (event)',
      tags: ['alert', 'noisy', 'event-heavy'],
      cpuCost: 'high' as const,
      channels: channels5,
      global: makeGlobal({ tempo: 132, scale: 'phrygian', rootNote: 'F3', masterVolume: -3 }),
    };

    return [ghostly, plinkyWood, musicBoxTonal, drone, rainy, tense];
  }
}

export default function Presets({ lockGlobalFrame = false }: { lockGlobalFrame?: boolean }) {
  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const addChannel = useStore((s) => s.addChannel);
  const removeChannel = useStore((s) => s.removeChannel);
  const updateGlobal = useStore((s) => s.updateGlobal);
  const setSelectedChannel = useStore((s) => s.setSelectedChannel);

  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets);
  const [builtinPresetId, setBuiltinPresetId] = useState('');
  const [name, setName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [abBaseline, setAbBaseline] = useState<SavedPreset | null>(null);
  const [abComparing, setAbComparing] = useState(false);
  const builtinPresets = useMemo(() => buildBuiltinPresets(), []);
  const selectedBuiltinPreset = builtinPresets.find((p) => p.id === builtinPresetId) ?? null;
  const currentSignature = useMemo(() => stateSignature(channels, global), [channels, global]);

  useEffect(() => {
    const matching = builtinPresets.find((p) => stateSignature(p.channels, p.global) === currentSignature);
    const nextId = matching?.id ?? '';
    setBuiltinPresetId((prev) => (prev === nextId ? prev : nextId));
  }, [builtinPresets, currentSignature]);

  const handleSave = () => {
    const defaultName = new Date().toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const preset: SavedPreset = {
      name: name.trim() || defaultName,
      channels,
      global,
      savedAt: Date.now(),
    };
    const next = [...presets, preset];
    savePresets(next);
    setPresets(next);
    setName('');
    setShowSave(false);
  };

  const handleLoad = (preset: SavedPreset) => {
    const normalized = normalizeSingleActiveChannels(preset.channels);
    // Clear existing channels
    for (const id of Object.keys(useStore.getState().channels)) {
      removeChannel(id);
    }
    // Add preset channels
    for (const config of Object.values(normalized.channels)) {
      addChannel(config as ChannelConfig);
    }
    // Update global unless lock is enabled
    if (!lockGlobalFrame) {
      updateGlobal(preset.global);
    }
    setSelectedChannel(normalized.selected);
  };

  const handleDelete = (index: number) => {
    const next = presets.filter((_, i) => i !== index);
    savePresets(next);
    setPresets(next);
  };

  const handleLoadBuiltin = () => {
    const preset = builtinPresets.find((p) => p.id === builtinPresetId);
    if (!preset) return;
    handleLoad({
      name: preset.name,
      channels: preset.channels,
      global: preset.global,
      savedAt: Date.now(),
    });
  };

  const snapshotCurrent = (): SavedPreset => ({
    name: 'Current Snapshot',
    channels: JSON.parse(JSON.stringify(useStore.getState().channels)) as Record<string, ChannelConfig>,
    global: JSON.parse(JSON.stringify(useStore.getState().global)) as GlobalConfig,
    savedAt: Date.now(),
  });

  const handleSetABaseline = () => {
    setAbBaseline(snapshotCurrent());
    setAbComparing(false);
  };

  const handleCompareBuiltin = () => {
    if (!builtinPresetId) return;
    const preset = builtinPresets.find((p) => p.id === builtinPresetId);
    if (!preset) return;
    if (!abBaseline) {
      setAbBaseline(snapshotCurrent());
    }
    handleLoad({
      name: preset.name,
      channels: preset.channels,
      global: preset.global,
      savedAt: Date.now(),
    });
    setAbComparing(true);
  };

  const handleRevertAB = () => {
    if (!abBaseline) return;
    handleLoad(abBaseline);
    setAbComparing(false);
  };

  const handleExport = () => {
    const data = JSON.stringify({ channels, global }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'streamscapes-preset.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.channels && data.global) {
          for (const id of Object.keys(useStore.getState().channels)) {
            removeChannel(id);
          }
          for (const config of Object.values(data.channels)) {
            addChannel(config as ChannelConfig);
          }
          if (!lockGlobalFrame) {
            updateGlobal(data.global);
          }
        }
      } catch {
        // Invalid file
      }
    };
    input.click();
  };

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <div className="panel-title !mb-0">Presets</div>
        <div className="flex gap-1">
          <button
            onClick={() => setShowSave(!showSave)}
            className="text-[10px] px-2 py-0.5 rounded bg-[#333] text-gray-400 hover:text-gray-200"
          >
            Save
          </button>
          <button
            onClick={handleExport}
            className="text-[10px] px-2 py-0.5 rounded bg-[#333] text-gray-400 hover:text-gray-200"
          >
            Export
          </button>
          <button
            onClick={handleImport}
            className="text-[10px] px-2 py-0.5 rounded bg-[#333] text-gray-400 hover:text-gray-200"
          >
            Import
          </button>
        </div>
        <div className="text-[10px] text-gray-500 mt-1 min-h-[14px]">
          {selectedBuiltinPreset?.description ?? 'Pick a preset to preview its sound profile.'}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 min-h-[14px]">
          {selectedBuiltinPreset
            ? `Signals: ${selectedBuiltinPreset.signalPlan}`
            : 'Signals: shown here after selecting a preset.'}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 min-h-[14px]">
          {selectedBuiltinPreset
            ? `Tags: ${selectedBuiltinPreset.tags.join(', ')} • CPU: ${selectedBuiltinPreset.cpuCost}`
            : 'Tags: shown here after selecting a preset.'}
        </div>
        <div className="text-[9px] text-gray-600 mt-0.5">
          Presets apply one active stream at a time in this workflow.
        </div>
      </div>

      {/* Built-in starter presets */}
      <div className="mb-3 p-2 rounded" style={{ background: '#252525' }}>
        <div className="text-[10px] text-gray-500 mb-1">Starter Presets</div>
        <div className="flex gap-1">
          <select
            value={builtinPresetId}
            onChange={(e) => setBuiltinPresetId(e.target.value)}
            className="flex-1 text-xs rounded px-2 py-1"
            style={{ background: '#333', color: '#ddd', border: 'none' }}
          >
            <option value="">Select a style...</option>
            {builtinPresets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleLoadBuiltin}
            disabled={!builtinPresetId}
            className="text-[10px] px-2 py-1 rounded bg-[#4ade80] text-black disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
        <div className="flex gap-1 mt-1.5">
          <button
            onClick={handleSetABaseline}
            className="text-[10px] px-2 py-1 rounded bg-[#333] text-gray-300 hover:text-white"
          >
            Set A (Current)
          </button>
          <button
            onClick={handleCompareBuiltin}
            disabled={!builtinPresetId}
            className="text-[10px] px-2 py-1 rounded bg-[#444] text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compare A/B
          </button>
          <button
            onClick={handleRevertAB}
            disabled={!abBaseline}
            className="text-[10px] px-2 py-1 rounded bg-[#3a2323] text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Revert To A
          </button>
        </div>
        <div className="text-[9px] text-gray-500 mt-1 min-h-[12px]">
          {abBaseline
            ? (abComparing ? 'Comparing B against saved A. Use Revert To A to restore.' : 'A snapshot saved.')
            : 'Set A before comparing presets.'}
        </div>
      </div>

      {/* Save input */}
      {showSave && (
        <div className="flex gap-1 mb-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Preset name..."
            className="flex-1 text-xs rounded px-2 py-1"
            style={{ background: '#333', color: '#ddd', border: 'none' }}
            autoFocus
          />
          <button
            onClick={handleSave}
            className="text-[10px] px-2 py-1 rounded bg-[#4ade80] text-black"
          >
            Save
          </button>
        </div>
      )}

      {/* Preset list */}
      {presets.length === 0 ? (
        <div className="text-[11px] text-gray-600 text-center py-2">
          No saved presets
        </div>
      ) : (
        <div className="space-y-0.5">
          {presets.map((preset, i) => (
            <div key={i} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#2a2a2a]">
              <button
                onClick={() => handleLoad(preset)}
                className="flex-1 text-left text-[11px] text-gray-300 hover:text-white"
              >
                {preset.name}
              </button>
              <span className="text-[9px] text-gray-600">
                {new Date(preset.savedAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => handleDelete(i)}
                className="text-[10px] text-red-400 hover:text-red-300 px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
