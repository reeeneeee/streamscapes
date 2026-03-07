"use client";

import { useState } from 'react';
import { useStore } from '@/store';
import type { ChannelConfig, GlobalConfig } from '@/types/sonification';

interface SavedPreset {
  name: string;
  channels: Record<string, ChannelConfig>;
  global: GlobalConfig;
  savedAt: number;
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

export default function Presets() {
  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const addChannel = useStore((s) => s.addChannel);
  const removeChannel = useStore((s) => s.removeChannel);
  const updateGlobal = useStore((s) => s.updateGlobal);

  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets);
  const [name, setName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    const preset: SavedPreset = {
      name: name.trim(),
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
    // Clear existing channels
    for (const id of Object.keys(useStore.getState().channels)) {
      removeChannel(id);
    }
    // Add preset channels
    for (const config of Object.values(preset.channels)) {
      addChannel(config as ChannelConfig);
    }
    // Update global
    updateGlobal(preset.global);
  };

  const handleDelete = (index: number) => {
    const next = presets.filter((_, i) => i !== index);
    savePresets(next);
    setPresets(next);
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
          updateGlobal(data.global);
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
