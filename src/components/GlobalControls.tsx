"use client";

import { useStore } from '@/store';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = [2, 3, 4, 5, 6];

const SCALES = [
  'major pentatonic',
  'minor pentatonic',
  'major',
  'minor',
  'blues',
  'chromatic',
  'dorian',
  'mixolydian',
  'lydian',
  'phrygian',
  'whole tone',
  'diminished',
];

export default function GlobalControls() {
  const global = useStore((s) => s.global);
  const updateGlobal = useStore((s) => s.updateGlobal);
  const resetAudioConfig = useStore((s) => s.resetAudioConfig);

  // Parse rootNote into note + octave (e.g. "C4" → "C", "4")
  const noteName = global.rootNote.replace(/\d+$/, '');
  const octave = parseInt(global.rootNote.match(/\d+$/)?.[0] ?? '4');

  return (
    <div className="panel">
      <div className="panel-title">Global</div>

      <div className="grid grid-cols-2 gap-2">
        {/* Root Note */}
        <div>
          <div className="text-[10px] text-gray-500 mb-1">Root Note</div>
          <select
            value={noteName}
            onChange={(e) => updateGlobal({ rootNote: `${e.target.value}${octave}` })}
            className="w-full text-xs rounded px-1.5 py-1"
          >
            {NOTES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Octave */}
        <div>
          <div className="text-[10px] text-gray-500 mb-1">Octave</div>
          <select
            value={octave}
            onChange={(e) => updateGlobal({ rootNote: `${noteName}${e.target.value}` })}
            className="w-full text-xs rounded px-1.5 py-1"
          >
            {OCTAVES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Scale */}
      <div className="mt-2">
        <div className="text-[10px] text-gray-500 mb-1">Scale</div>
        <select
          value={global.scale}
          onChange={(e) => updateGlobal({ scale: e.target.value })}
          className="w-full text-xs rounded px-1.5 py-1"
          style={{ background: '#333', color: '#ddd', border: 'none' }}
        >
          {SCALES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Tempo */}
      <div className="mt-2">
        <div className="text-[10px] text-gray-500 mb-1">Tempo: {global.tempo} BPM</div>
        <input
          type="range"
          min={40}
          max={240}
          value={global.tempo}
          onChange={(e) => updateGlobal({ tempo: parseInt(e.target.value) })}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: 'var(--accent)' }}
        />
      </div>

      <div className="mt-3 pt-2 border-t border-white/10">
        <button
          onClick={() => {
            if (!window.confirm('Reset all audio settings to defaults?')) return;
            resetAudioConfig();
          }}
          className="w-full text-[11px] px-2 py-1 rounded bg-[#3a2323] text-red-300 hover:text-red-200 hover:bg-[#4a2a2a]"
        >
          Factory Reset Audio Config
        </button>
      </div>
    </div>
  );
}
