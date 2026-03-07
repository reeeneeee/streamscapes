"use client";

import { useEffect } from 'react';
import { useStore } from '@/store';
import type { AlertTier, AmbientMode, BehaviorType, ChannelConfig, EventArticulation, SonificationMode, SynthType } from '@/types/sonification';

const SYNTH_TYPES: { value: SynthType; label: string }[] = [
  { value: 'Synth', label: 'Sine' },
  { value: 'FMSynth', label: 'FM' },
  { value: 'AMSynth', label: 'AM' },
  { value: 'PluckSynth', label: 'Pluck' },
  { value: 'MembraneSynth', label: 'Membrane' },
  { value: 'NoiseSynth', label: 'Noise' },
];

const STREAM_COLORS: Record<string, string> = {
  weather: '#7C444F',
  flights: '#5C7285',
  wikipedia: '#5D8736',
  rss: '#B8860B',
  stocks: '#E6A817',
};

const ENVELOPE_SUPPORTED_SYNTHS: SynthType[] = ['Synth', 'FMSynth', 'AMSynth', 'MembraneSynth'];
const BEHAVIOR_TYPES: { value: BehaviorType; label: string }[] = [
  { value: 'ambient', label: 'Ambient' },
  { value: 'event', label: 'Event' },
  { value: 'hybrid', label: 'Hybrid' },
];
const AMBIENT_MODES: { value: AmbientMode; label: string; mode: SonificationMode; description: string }[] = [
  { value: 'arpeggio', label: 'Arpeggio', mode: 'pattern', description: 'Repeating melodic pattern shaped by slow signal drift.' },
  { value: 'sustain', label: 'Sustain', mode: 'continuous', description: 'Held, low-fatigue bed with slow modulation.' },
  { value: 'sample', label: 'Sample', mode: 'pattern', description: 'Looped/sliced sample bed with data-driven playback rate and density.' },
];
const SAMPLE_SOURCES: { value: string; label: string }[] = [
  { value: 'rain', label: 'Rain Texture' },
  { value: 'wind', label: 'Wind Bed' },
  { value: 'vinyl', label: 'Vinyl Dust' },
  { value: 'chimes', label: 'Soft Chimes' },
];
const EVENT_ARTICULATIONS: { value: EventArticulation; label: string; description: string }[] = [
  { value: 'soft', label: 'Soft', description: 'Longer, gentler notes for less intrusive monitoring.' },
  { value: 'neutral', label: 'Neutral', description: 'Balanced note length and intensity.' },
  { value: 'punchy', label: 'Punchy', description: 'Short, bright accents that cut through the mix.' },
];
const ALERT_TIERS: { value: AlertTier; label: string }[] = [
  { value: 'advisory', label: 'Advisory' },
  { value: 'abnormal', label: 'Abnormal' },
  { value: 'critical', label: 'Critical' },
];

const STREAM_RECOMMENDATIONS: Record<string, {
  behaviorType: BehaviorType;
  ambientMode?: AmbientMode;
  synthType: SynthType;
  mode: SonificationMode;
  hint: string;
}> = {
  weather: {
    behaviorType: 'ambient',
    ambientMode: 'sustain',
    synthType: 'AMSynth',
    mode: 'continuous',
    hint: 'Weather changes slowly; ambient sustain is usually easiest to read over time.',
  },
  flights: {
    behaviorType: 'ambient',
    ambientMode: 'sustain',
    synthType: 'FMSynth',
    mode: 'continuous',
    hint: 'Flight streams are dense; sustain keeps load low while preserving motion.',
  },
  wikipedia: {
    behaviorType: 'event',
    synthType: 'Synth',
    mode: 'triggered',
    hint: 'Edit events are point-based; event mode keeps each update perceptible.',
  },
  rss: {
    behaviorType: 'event',
    synthType: 'PluckSynth',
    mode: 'triggered',
    hint: 'RSS items are discrete arrivals; plucked event notes work well here.',
  },
  stocks: {
    behaviorType: 'event',
    synthType: 'MembraneSynth',
    mode: 'triggered',
    hint: 'Ticks are event-like; event mode with cooldown prevents over-triggering.',
  },
};

export default function SonificationPanel() {
  const channels = useStore((s) => s.channels);
  const selectedId = useStore((s) => s.selectedChannelId);
  const updateChannel = useStore((s) => s.updateChannel);
  const setSelected = useStore((s) => s.setSelectedChannel);

  const channelIds = Object.keys(channels);

  if (channelIds.length === 0) {
    return null;
  }

  const activeId = selectedId && channels[selectedId] ? selectedId : channelIds[0];
  const config = channels[activeId];
  if (!config) return null;

  useEffect(() => {
    if (!selectedId || !channels[selectedId]) {
      setSelected(activeId);
    }
  }, [activeId, channels, selectedId, setSelected]);

  const envelope = (config.synthOptions.envelope as Record<string, number>) ?? {
    attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3,
  };
  const color = STREAM_COLORS[activeId] ?? '#888';
  const behaviorType: BehaviorType = config.behaviorType ?? 'event';
  const ambientMode: AmbientMode = config.ambientMode ?? 'arpeggio';
  const recommendation = STREAM_RECOMMENDATIONS[activeId];

  const updateEnvelope = (param: string, value: number) => {
    updateChannel(activeId, {
      synthOptions: {
        ...config.synthOptions,
        envelope: { ...envelope, [param]: value },
      },
    });
  };

  const setBehaviorType = (next: BehaviorType) => {
    if (next === 'ambient') {
      const nextAmbient = config.ambientMode ?? 'arpeggio';
      const mode = AMBIENT_MODES.find((m) => m.value === nextAmbient)?.mode ?? 'pattern';
      updateChannel(activeId, {
        behaviorType: 'ambient',
        ambientMode: nextAmbient,
        mode,
        smoothingMs: config.smoothingMs ?? 1200,
        sampleSource: config.sampleSource ?? 'rain',
        samplePlaybackRateMin: config.samplePlaybackRateMin ?? 0.8,
        samplePlaybackRateMax: config.samplePlaybackRateMax ?? 1.2,
        sampleDensity: config.sampleDensity ?? 1.2,
        sampleFilterCutoff: config.sampleFilterCutoff ?? 2200,
        sampleReverbSend: config.sampleReverbSend ?? 0.25,
        alertTier: config.alertTier ?? 'advisory',
        beaconThreshold: config.beaconThreshold ?? 0,
        beaconPeriodicSec: config.beaconPeriodicSec ?? 0,
        beaconOnExtrema: config.beaconOnExtrema ?? false,
      });
      return;
    }
    if (next === 'event') {
      updateChannel(activeId, {
        behaviorType: 'event',
        mode: 'triggered',
        eventCooldownMs: config.eventCooldownMs ?? 150,
        eventTriggerThreshold: config.eventTriggerThreshold ?? 0,
        eventBurstCap: config.eventBurstCap ?? 0,
        eventBurstWindowMs: config.eventBurstWindowMs ?? 1200,
        eventArticulation: config.eventArticulation ?? 'neutral',
        alertTier: config.alertTier ?? 'abnormal',
        beaconThreshold: config.beaconThreshold ?? 0.8,
        beaconPeriodicSec: config.beaconPeriodicSec ?? 0,
        beaconOnExtrema: config.beaconOnExtrema ?? true,
      });
      return;
    }
    updateChannel(activeId, {
      behaviorType: 'hybrid',
      mode: 'pattern',
      ambientMode: config.ambientMode ?? 'arpeggio',
      smoothingMs: config.smoothingMs ?? 800,
      sampleSource: config.sampleSource ?? 'rain',
      samplePlaybackRateMin: config.samplePlaybackRateMin ?? 0.8,
      samplePlaybackRateMax: config.samplePlaybackRateMax ?? 1.2,
      sampleDensity: config.sampleDensity ?? 1.2,
      sampleFilterCutoff: config.sampleFilterCutoff ?? 2200,
      sampleReverbSend: config.sampleReverbSend ?? 0.25,
      eventCooldownMs: config.eventCooldownMs ?? 180,
      eventTriggerThreshold: config.eventTriggerThreshold ?? 0,
      eventBurstCap: config.eventBurstCap ?? 0,
      eventBurstWindowMs: config.eventBurstWindowMs ?? 1200,
      eventArticulation: config.eventArticulation ?? 'neutral',
      alertTier: config.alertTier ?? 'abnormal',
      beaconThreshold: config.beaconThreshold ?? 0.8,
      beaconPeriodicSec: config.beaconPeriodicSec ?? 0,
      beaconOnExtrema: config.beaconOnExtrema ?? true,
      hybridAccent: config.hybridAccent ?? 0.6,
    });
  };

  const setAmbientMode = (next: AmbientMode) => {
    // In hybrid, keep pattern mode so ambient + event lanes stay active together.
    const mode =
      behaviorType === 'hybrid'
        ? 'pattern'
        : (AMBIENT_MODES.find((m) => m.value === next)?.mode ?? 'pattern');
    const patch: Partial<ChannelConfig> = next === 'sustain' && config.volume < -12
      ? { ambientMode: next, mode, volume: -12 }
      : { ambientMode: next, mode };
    updateChannel(activeId, patch);
  };

  const applyRecommended = () => {
    if (!recommendation) return;
    updateChannel(activeId, {
      behaviorType: recommendation.behaviorType,
      ambientMode: recommendation.ambientMode,
      synthType: recommendation.synthType,
      mode: recommendation.mode,
      smoothingMs: recommendation.behaviorType === 'ambient' ? (config.smoothingMs ?? 1200) : config.smoothingMs,
      eventCooldownMs: recommendation.behaviorType === 'event' ? (config.eventCooldownMs ?? 180) : config.eventCooldownMs,
    });
  };

  return (
    <div className="panel">
      <div className="panel-title">Sonification</div>

      {/* Persistent recommended action */}
      <div className="mb-3 p-2 rounded" style={{ background: '#252525' }}>
        <div className="text-[10px] text-gray-400 mb-1">Recommended Preset</div>
        <div className="text-[10px] text-gray-500 mb-2 min-h-[28px]">
          {recommendation
            ? `For ${activeId}: ${recommendation.behaviorType} / ${recommendation.ambientMode ?? 'event'} / ${recommendation.synthType}. ${recommendation.hint}`
            : `No recommendation available for ${activeId}.`}
        </div>
        <button
          onClick={applyRecommended}
          disabled={!recommendation}
          className="text-[10px] px-2 py-1 rounded bg-[#4ade80] text-black disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply Recommended Preset
        </button>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 mb-3">
        {channelIds.map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className="text-[11px] px-2 py-1 rounded transition-colors"
            style={{
              background: id === activeId ? (STREAM_COLORS[id] ?? '#555') : '#333',
              color: id === activeId ? '#fff' : '#888',
            }}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Synth type */}
      <div className="mb-3">
        <div className="text-[10px] text-gray-500 mb-1">Synth Type</div>
        <div className="grid grid-cols-3 gap-1">
          {SYNTH_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateChannel(activeId, { synthType: value })}
              className="text-[10px] px-1.5 py-1 rounded transition-colors"
              style={{
                background: config.synthType === value ? color : '#333',
                color: config.synthType === value ? '#fff' : '#888',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Behavior */}
      <div className="mb-3">
        <div className="text-[10px] text-gray-500 mb-1">Behavior Type</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {BEHAVIOR_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setBehaviorType(value)}
              className="text-[10px] px-1.5 py-1 rounded transition-colors"
              style={{
                background: behaviorType === value ? color : '#333',
                color: behaviorType === value ? '#fff' : '#888',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {behaviorType === 'ambient' && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1">
              {AMBIENT_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setAmbientMode(m.value)}
                  className="text-[10px] px-1.5 py-1 rounded transition-colors"
                  style={{
                    background: ambientMode === m.value ? '#5c7285' : '#333',
                    color: ambientMode === m.value ? '#fff' : '#888',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-500">
              {AMBIENT_MODES.find((m) => m.value === ambientMode)?.description}
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Smoothing</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.smoothingMs ?? 1200}ms</span>
              </div>
              <input
                type="range"
                min={100}
                max={5000}
                step={50}
                value={config.smoothingMs ?? 1200}
                onChange={(e) => updateChannel(activeId, { smoothingMs: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#5c7285' }}
              />
            </div>
            {ambientMode === 'sample' && (
              <div className="space-y-1.5 p-1.5 rounded" style={{ background: '#2b2b2b' }}>
                <div className="text-[10px] text-gray-400">Sample Engine</div>
                <div className="grid grid-cols-2 gap-1">
                  {SAMPLE_SOURCES.map((src) => (
                    <button
                      key={src.value}
                      onClick={() => updateChannel(activeId, { sampleSource: src.value })}
                      className="text-[10px] px-1.5 py-1 rounded transition-colors"
                      style={{
                        background: (config.sampleSource ?? 'rain') === src.value ? '#556' : '#333',
                        color: (config.sampleSource ?? 'rain') === src.value ? '#fff' : '#888',
                      }}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Rate Min</span>
                      <span className="text-[10px] text-gray-400 font-mono">{(config.samplePlaybackRateMin ?? 0.8).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={2}
                      step={0.01}
                      value={config.samplePlaybackRateMin ?? 0.8}
                      onChange={(e) => updateChannel(activeId, { samplePlaybackRateMin: parseFloat(e.target.value) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Rate Max</span>
                      <span className="text-[10px] text-gray-400 font-mono">{(config.samplePlaybackRateMax ?? 1.2).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.01}
                      value={config.samplePlaybackRateMax ?? 1.2}
                      onChange={(e) => updateChannel(activeId, { samplePlaybackRateMax: parseFloat(e.target.value) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-gray-500">Density</span>
                    <span className="text-[10px] text-gray-400 font-mono">{(config.sampleDensity ?? 1.2).toFixed(1)} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={8}
                    step={0.1}
                    value={config.sampleDensity ?? 1.2}
                    onChange={(e) => updateChannel(activeId, { sampleDensity: parseFloat(e.target.value) })}
                    className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#6b7280' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Filter</span>
                      <span className="text-[10px] text-gray-400 font-mono">{Math.round(config.sampleFilterCutoff ?? 2200)}Hz</span>
                    </div>
                    <input
                      type="range"
                      min={200}
                      max={10000}
                      step={50}
                      value={config.sampleFilterCutoff ?? 2200}
                      onChange={(e) => updateChannel(activeId, { sampleFilterCutoff: parseInt(e.target.value, 10) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Reverb Send</span>
                      <span className="text-[10px] text-gray-400 font-mono">{Math.round((config.sampleReverbSend ?? 0.25) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={config.sampleReverbSend ?? 0.25}
                      onChange={(e) => updateChannel(activeId, { sampleReverbSend: parseFloat(e.target.value) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {behaviorType === 'event' && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[10px] text-gray-500">Event Cooldown</span>
              <span className="text-[10px] text-gray-400 font-mono">{config.eventCooldownMs ?? 150}ms</span>
            </div>
            <input
              type="range"
              min={0}
              max={1500}
              step={25}
              value={config.eventCooldownMs ?? 150}
              onChange={(e) => updateChannel(activeId, { eventCooldownMs: parseInt(e.target.value, 10) })}
              className="w-full h-1 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: '#888' }}
            />
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Trigger Threshold</span>
                <span className="text-[10px] text-gray-400 font-mono">{(config.eventTriggerThreshold ?? 0).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={config.eventTriggerThreshold ?? 0}
                onChange={(e) => updateChannel(activeId, { eventTriggerThreshold: parseFloat(e.target.value) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Burst Cap</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.eventBurstCap ?? 0}</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={config.eventBurstCap ?? 0}
                onChange={(e) => updateChannel(activeId, { eventBurstCap: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Burst Window</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.eventBurstWindowMs ?? 1200}ms</span>
              </div>
              <input
                type="range"
                min={200}
                max={5000}
                step={50}
                value={config.eventBurstWindowMs ?? 1200}
                onChange={(e) => updateChannel(activeId, { eventBurstWindowMs: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-1">Articulation</div>
              <div className="grid grid-cols-3 gap-1">
                {EVENT_ARTICULATIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => updateChannel(activeId, { eventArticulation: a.value })}
                    className="text-[10px] px-1.5 py-1 rounded transition-colors"
                    style={{
                      background: (config.eventArticulation ?? 'neutral') === a.value ? '#555' : '#333',
                      color: (config.eventArticulation ?? 'neutral') === a.value ? '#fff' : '#888',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {EVENT_ARTICULATIONS.find((a) => a.value === (config.eventArticulation ?? 'neutral'))?.description}
              </div>
            </div>
          </div>
        )}

        {behaviorType === 'hybrid' && (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-400">Ambient lane</div>
            <div className="text-[10px] text-gray-500">
              Hybrid always runs both lanes. This selects ambient bed style only.
            </div>
            <div className="grid grid-cols-3 gap-1">
              {AMBIENT_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setAmbientMode(m.value)}
                  className="text-[10px] px-1.5 py-1 rounded transition-colors"
                  style={{
                    background: ambientMode === m.value ? '#5c7285' : '#333',
                    color: ambientMode === m.value ? '#fff' : '#888',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Smoothing</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.smoothingMs ?? 800}ms</span>
              </div>
              <input
                type="range"
                min={100}
                max={5000}
                step={50}
                value={config.smoothingMs ?? 800}
                onChange={(e) => updateChannel(activeId, { smoothingMs: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#5c7285' }}
              />
            </div>
            {ambientMode === 'sample' && (
              <div className="space-y-1.5 p-1.5 rounded" style={{ background: '#2b2b2b' }}>
                <div className="text-[10px] text-gray-400">Sample Engine</div>
                <div className="grid grid-cols-2 gap-1">
                  {SAMPLE_SOURCES.map((src) => (
                    <button
                      key={src.value}
                      onClick={() => updateChannel(activeId, { sampleSource: src.value })}
                      className="text-[10px] px-1.5 py-1 rounded transition-colors"
                      style={{
                        background: (config.sampleSource ?? 'rain') === src.value ? '#556' : '#333',
                        color: (config.sampleSource ?? 'rain') === src.value ? '#fff' : '#888',
                      }}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Rate Min</span>
                      <span className="text-[10px] text-gray-400 font-mono">{(config.samplePlaybackRateMin ?? 0.8).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={2}
                      step={0.01}
                      value={config.samplePlaybackRateMin ?? 0.8}
                      onChange={(e) => updateChannel(activeId, { samplePlaybackRateMin: parseFloat(e.target.value) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Rate Max</span>
                      <span className="text-[10px] text-gray-400 font-mono">{(config.samplePlaybackRateMax ?? 1.2).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.01}
                      value={config.samplePlaybackRateMax ?? 1.2}
                      onChange={(e) => updateChannel(activeId, { samplePlaybackRateMax: parseFloat(e.target.value) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-gray-500">Density</span>
                    <span className="text-[10px] text-gray-400 font-mono">{(config.sampleDensity ?? 1.2).toFixed(1)} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={8}
                    step={0.1}
                    value={config.sampleDensity ?? 1.2}
                    onChange={(e) => updateChannel(activeId, { sampleDensity: parseFloat(e.target.value) })}
                    className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#6b7280' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Filter</span>
                      <span className="text-[10px] text-gray-400 font-mono">{Math.round(config.sampleFilterCutoff ?? 2200)}Hz</span>
                    </div>
                    <input
                      type="range"
                      min={200}
                      max={10000}
                      step={50}
                      value={config.sampleFilterCutoff ?? 2200}
                      onChange={(e) => updateChannel(activeId, { sampleFilterCutoff: parseInt(e.target.value, 10) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-gray-500">Reverb Send</span>
                      <span className="text-[10px] text-gray-400 font-mono">{Math.round((config.sampleReverbSend ?? 0.25) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={config.sampleReverbSend ?? 0.25}
                      onChange={(e) => updateChannel(activeId, { sampleReverbSend: parseFloat(e.target.value) })}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6b7280' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="text-[10px] text-gray-400 pt-1">Event lane</div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Event Cooldown</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.eventCooldownMs ?? 180}ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={1500}
                step={25}
                value={config.eventCooldownMs ?? 180}
                onChange={(e) => updateChannel(activeId, { eventCooldownMs: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Trigger Threshold</span>
                <span className="text-[10px] text-gray-400 font-mono">{(config.eventTriggerThreshold ?? 0).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={config.eventTriggerThreshold ?? 0}
                onChange={(e) => updateChannel(activeId, { eventTriggerThreshold: parseFloat(e.target.value) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Burst Cap</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.eventBurstCap ?? 0}</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={config.eventBurstCap ?? 0}
                onChange={(e) => updateChannel(activeId, { eventBurstCap: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Burst Window</span>
                <span className="text-[10px] text-gray-400 font-mono">{config.eventBurstWindowMs ?? 1200}ms</span>
              </div>
              <input
                type="range"
                min={200}
                max={5000}
                step={50}
                value={config.eventBurstWindowMs ?? 1200}
                onChange={(e) => updateChannel(activeId, { eventBurstWindowMs: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-1">Articulation</div>
              <div className="grid grid-cols-3 gap-1">
                {EVENT_ARTICULATIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => updateChannel(activeId, { eventArticulation: a.value })}
                    className="text-[10px] px-1.5 py-1 rounded transition-colors"
                    style={{
                      background: (config.eventArticulation ?? 'neutral') === a.value ? '#555' : '#333',
                      color: (config.eventArticulation ?? 'neutral') === a.value ? '#fff' : '#888',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500">Accent</span>
                <span className="text-[10px] text-gray-400 font-mono">{Math.round((config.hybridAccent ?? 0.6) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={config.hybridAccent ?? 0.6}
                onChange={(e) => updateChannel(activeId, { hybridAccent: parseFloat(e.target.value) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#b8860b' }}
              />
            </div>
            <div className="text-[10px] text-gray-500">
              Hybrid blends a continuous ambient bed with sparse note accents from incoming events.
            </div>
          </div>
        )}
      </div>

      {/* Monitoring semantics */}
      <div className="mb-3 p-2 rounded" style={{ background: '#252525' }}>
        <div className="text-[10px] text-gray-400 mb-1">Monitoring Beacons</div>
        <div className="text-[10px] text-gray-500 mb-1">
          Optional cues for threshold crossings, new extrema, and periodic check-ins.
        </div>
        <div className="mb-1.5">
          <div className="text-[10px] text-gray-500 mb-1">Priority Tier</div>
          <div className="grid grid-cols-3 gap-1">
            {ALERT_TIERS.map((tier) => (
              <button
                key={tier.value}
                onClick={() => updateChannel(activeId, { alertTier: tier.value })}
                className="text-[10px] px-1.5 py-1 rounded transition-colors"
                style={{
                  background: (config.alertTier ?? 'advisory') === tier.value ? '#555' : '#333',
                  color: (config.alertTier ?? 'advisory') === tier.value ? '#fff' : '#888',
                }}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-1.5">
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-500">Threshold Beacon</span>
            <span className="text-[10px] text-gray-400 font-mono">{(config.beaconThreshold ?? 0).toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={config.beaconThreshold ?? 0}
            onChange={(e) => updateChannel(activeId, { beaconThreshold: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#888' }}
          />
          <div className="text-[9px] text-gray-500">0 disables threshold-crossing beacons.</div>
        </div>
        <div className="mb-1.5">
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-500">Periodic Beacon</span>
            <span className="text-[10px] text-gray-400 font-mono">{config.beaconPeriodicSec ?? 0}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={60}
            step={1}
            value={config.beaconPeriodicSec ?? 0}
            onChange={(e) => updateChannel(activeId, { beaconPeriodicSec: parseInt(e.target.value, 10) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#888' }}
          />
          <div className="text-[9px] text-gray-500">0 disables periodic check-in beacons.</div>
        </div>
        <label className="text-[10px] text-gray-400 inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={config.beaconOnExtrema ?? false}
            onChange={(e) => updateChannel(activeId, { beaconOnExtrema: e.target.checked })}
          />
          Beacon on new extrema (new min/max observed)
        </label>
      </div>

      {/* Envelope */}
      <div style={{ opacity: ENVELOPE_SUPPORTED_SYNTHS.includes(config.synthType) ? 1 : 0.45 }}>
        <div className="text-[10px] text-gray-500 mb-1">
          Envelope
          {!ENVELOPE_SUPPORTED_SYNTHS.includes(config.synthType) && (
            <span className="ml-1">(not available for {config.synthType})</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <EnvelopeKnob
            label="Attack"
            value={envelope.attack ?? 0.01}
            min={0.001}
            max={2}
            disabled={!ENVELOPE_SUPPORTED_SYNTHS.includes(config.synthType)}
            onChange={(v) => updateEnvelope('attack', v)}
          />
          <EnvelopeKnob
            label="Decay"
            value={envelope.decay ?? 0.2}
            min={0.01}
            max={2}
            disabled={!ENVELOPE_SUPPORTED_SYNTHS.includes(config.synthType)}
            onChange={(v) => updateEnvelope('decay', v)}
          />
          <EnvelopeKnob
            label="Sustain"
            value={envelope.sustain ?? 0.5}
            min={0}
            max={1}
            disabled={!ENVELOPE_SUPPORTED_SYNTHS.includes(config.synthType)}
            onChange={(v) => updateEnvelope('sustain', v)}
          />
          <EnvelopeKnob
            label="Release"
            value={envelope.release ?? 0.3}
            min={0.01}
            max={5}
            disabled={!ENVELOPE_SUPPORTED_SYNTHS.includes(config.synthType)}
            onChange={(v) => updateEnvelope('release', v)}
          />
        </div>
      </div>
    </div>
  );
}

function EnvelopeKnob({
  label,
  value,
  min,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-400 font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: '#888' }}
      />
    </div>
  );
}
