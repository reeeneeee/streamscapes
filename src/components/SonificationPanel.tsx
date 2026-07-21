"use client";

import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { STREAM_COLORS, getStreamColor, getStreamLabel } from '@/lib/stream-constants';
import { INTENTS } from '@/lib/intents';
import SampleEngineControls from './SampleEngineControls';
import EventControls from './EventControls';
import { ARP_SHAPES } from '@/lib/audio-engine';
import type { AlertTier, AmbientMode, BehaviorType, ChannelConfig, SonificationMode, SynthType } from '@/types/sonification';

const SYNTH_TYPES: { value: SynthType; label: string }[] = [
  { value: 'Synth', label: 'Sine' },
  { value: 'FMSynth', label: 'FM' },
  { value: 'AMSynth', label: 'AM' },
  { value: 'PluckSynth', label: 'Pluck' },
  { value: 'MembraneSynth', label: 'Membrane' },
  { value: 'NoiseSynth', label: 'Noise' },
];

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
const ALERT_TIERS: { value: AlertTier; label: string }[] = [
  { value: 'advisory', label: 'Advisory' },
  { value: 'abnormal', label: 'Abnormal' },
  { value: 'critical', label: 'Critical' },
];


function ShapeSVG({ degrees, color = 'rgba(245,240,235,0.4)', width = 28, height = 14 }: {
  degrees: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (degrees.length < 2) return null;
  const maxDeg = Math.max(...degrees);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const points = degrees.map((d, i) => {
    const x = pad + (i / (degrees.length - 1)) * w;
    const y = pad + (1 - d / Math.max(maxDeg, 1)) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SonificationPanel({ showAdvanced = true }: { showAdvanced?: boolean }) {
  const channels = useStore((s) => s.channels);
  const selectedId = useStore((s) => s.selectedChannelId);
  const updateChannel = useStore((s) => s.updateChannel);
  const setSelected = useStore((s) => s.setSelectedChannel);

  // Hide silent parent channels — they're connection toggles, not sound sources
  const HIDDEN_PARENTS = ['otlp', 'weather'];
  const channelIds = Object.keys(channels).filter((id) => !HIDDEN_PARENTS.includes(id));
  const activeId = selectedId && channels[selectedId] && !HIDDEN_PARENTS.includes(selectedId) ? selectedId : channelIds[0];
  const config = activeId ? channels[activeId] : undefined;

  // Sync selection — hooks must always run (no early returns above)
  useEffect(() => {
    if (!selectedId || !channels[selectedId]) {
      if (activeId) setSelected(activeId);
    }
  }, [activeId, channels, selectedId, setSelected]);

  // All hooks MUST be above the early return (React rule of hooks)
  const [arpPickerOpen, setArpPickerOpen] = useState<string | null>(null);

  if (channelIds.length === 0 || !config || !activeId) {
    return null;
  }

  const envelope = (config.synthOptions.envelope as Record<string, number>) ?? {
    attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3,
  };
  const color = getStreamColor(activeId);
  const behaviorType: BehaviorType = config.behaviorType ?? 'event';
  const ambientMode: AmbientMode = config.ambientMode ?? 'arpeggio';

  const onUpdate = (partial: Partial<ChannelConfig>) => updateChannel(activeId, partial);

  const updateEnvelope = (param: string, value: number) => {
    onUpdate({
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
      onUpdate({
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
      onUpdate({
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
    onUpdate({
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
    const mode =
      behaviorType === 'hybrid'
        ? 'pattern'
        : (AMBIENT_MODES.find((m) => m.value === next)?.mode ?? 'pattern');
    const patch: Partial<ChannelConfig> = next === 'sustain' && config.volume < -12
      ? { ambientMode: next, mode, volume: -12 }
      : { ambientMode: next, mode };
    onUpdate(patch);
  };

  // Group channels: continuous (ambient/hybrid) vs discrete (events)
  const timeSeries = channelIds.filter((id) => {
    const ch = channels[id];
    return ch.behaviorType === 'ambient' || ch.behaviorType === 'hybrid';
  });
  const events = channelIds.filter((id) => {
    const ch = channels[id];
    return ch.behaviorType !== 'ambient' && ch.behaviorType !== 'hybrid';
  });

  const ambientModeLabel = (ch: ChannelConfig): string => {
    const m = ch.ambientMode ?? 'arpeggio';
    if (m === 'arpeggio') return 'arp';
    if (m === 'sustain') return 'drone';
    if (m === 'sample') return 'sample';
    return m;
  };

  const toggleAmbientMode = (id: string, mode: 'arpeggio' | 'sustain') => {
    const modeMap = { arpeggio: 'pattern' as const, sustain: 'continuous' as const };
    updateChannel(id, { ambientMode: mode, mode: modeMap[mode] });
  };

  const StreamRow = ({ id }: { id: string }) => {
    const ch = channels[id];
    const isActive = id === activeId;
    const streamColor = getStreamColor(id);
    const isContinuous = ch.behaviorType === 'ambient' || ch.behaviorType === 'hybrid';
    const currentMode = ch.ambientMode ?? 'arpeggio';
    const currentShape = ARP_SHAPES[ch.patternType ?? 'walk'] ?? ARP_SHAPES.upDown;
    const showArpPicker = arpPickerOpen === id;
    return (
      <div style={{ position: 'relative' }}>
        <div
          className="flex items-center gap-2 w-full rounded px-2 py-1.5 transition-colors cursor-pointer"
          onClick={() => setSelected(id)}
          style={{
            background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: streamColor,
            }}
          />
          <span
            className="text-[11px]"
            style={{
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: isActive ? 500 : 400,
              minWidth: 70,
            }}
          >
            {getStreamLabel(id)}
          </span>
          {isContinuous && (
            <>
              <span
                className="flex rounded overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {(['arpeggio', 'sustain'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { toggleAmbientMode(id, m); setSelected(id); }}
                    className="text-[9px] px-2 py-0.5 transition-colors"
                    style={{
                      background: currentMode === m ? 'rgba(255,255,255,0.12)' : 'transparent',
                      color: currentMode === m ? 'var(--text-primary)' : 'rgba(245,240,235,0.2)',
                      borderRight: m === 'arpeggio' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    }}
                  >
                    {m === 'arpeggio' ? 'arp' : 'steady'}
                  </button>
                ))}
              </span>
              {currentMode === 'arpeggio' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setArpPickerOpen(showArpPicker ? null : id); }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5"
                  style={{
                    background: showArpPicker ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                  }}
                >
                  <ShapeSVG degrees={currentShape.degrees} color={isActive ? streamColor : 'rgba(245,240,235,0.4)'} />
                </button>
              )}
            </>
          )}
          <span className="flex-1" />
          {/* Preset dropdown — filtered by channel mode */}
          <select
            value={ch.intent ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const intent = INTENTS.find((i) => i.id === e.target.value);
              if (intent) {
                const patch: Record<string, unknown> = {
                  ...intent.patch,
                  intent: intent.id,
                  noiseType: intent.patch.noiseType ?? undefined,
                };
                // Don't let intent override mode for event channels — keep them triggered
                if (ch.behaviorType === 'event') patch.mode = 'triggered';
                updateChannel(id, patch as Partial<typeof ch>);
              }
            }}
            style={{
              fontFamily: 'var(--font-body, var(--ff-body))',
              fontSize: 9,
              color: ch.intent ? (isActive ? '#fff' : 'rgba(245,240,235,0.45)') : 'rgba(245,240,235,0.2)',
              background: ch.intent ? (isActive ? streamColor : 'rgba(255,255,255,0.06)') : 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '2px 6px',
              cursor: 'pointer',
              outline: 'none',
              maxWidth: 90,
              WebkitAppearance: 'none' as const,
              appearance: 'none' as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='rgba(245,240,235,0.3)' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 5px center',
              paddingRight: 16,
            }}
          >
            <option value="" disabled style={{ background: '#1a1a1a', color: 'rgba(245,240,235,0.3)' }}>Preset</option>
            {INTENTS.filter((intent) => {
              // Show continuous presets only for continuous channels, all others for non-continuous
              if (ch.mode === 'continuous') return intent.patch.mode === 'continuous';
              return intent.patch.mode !== 'continuous';
            }).map((intent) => (
              <option key={intent.id} value={intent.id} style={{ background: '#1a1a1a', color: '#F5F0EB' }}>
                {intent.name}
              </option>
            ))}
          </select>
        </div>
        {showArpPicker && (
          <div
            className="grid gap-1 rounded-lg p-2"
            style={{
              position: 'absolute',
              left: 8,
              top: '100%',
              zIndex: 20,
              gridTemplateColumns: 'repeat(5, 1fr)',
              background: 'rgba(20, 18, 16, 0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {Object.entries(ARP_SHAPES).map(([key, { label, degrees }]) => {
              const selected = (ch.patternType ?? 'walk') === key;
              return (
                <button
                  key={key}
                  onClick={() => { updateChannel(id, { patternType: key }); setArpPickerOpen(null); }}
                  className="flex flex-col items-center gap-0.5 rounded px-1 py-1 transition-colors"
                  style={{
                    background: selected ? 'rgba(255,255,255,0.12)' : 'transparent',
                    border: selected ? `1px solid ${streamColor}` : '1px solid transparent',
                  }}
                >
                  <ShapeSVG degrees={degrees} width={32} height={16} color={selected ? streamColor : 'rgba(245,240,235,0.35)'} />
                  <span className="text-[8px]" style={{ color: selected ? 'var(--text-primary)' : 'rgba(245,240,235,0.3)' }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-title">Sonification</div>


      {/* Stream groups */}
      {timeSeries.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(245,240,235,0.25)', letterSpacing: '0.1em' }}>
            Continuous
          </div>
          <div className="space-y-0.5">
            {timeSeries.map((id) => <StreamRow key={id} id={id} />)}
          </div>
        </div>
      )}
      {events.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(245,240,235,0.25)', letterSpacing: '0.1em' }}>
            Discrete
          </div>
          <div className="space-y-0.5">
            {events.map((id) => <StreamRow key={id} id={id} />)}
          </div>
        </div>
      )}

      {/* Advanced controls — hidden unless expanded */}
      {!showAdvanced ? null : <div style={{ paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Selected stream indicator */}
      <div className="mb-3 flex items-center gap-2">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span className="text-[11px]" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
          {getStreamLabel(activeId)}
        </span>
      </div>
      {/* Synth type */}
      <div className="mb-3">
        <div className="text-[10px] text-gray-500 mb-1">Synth Type</div>
        <div className="grid grid-cols-3 gap-1">
          {SYNTH_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onUpdate({ synthType: value })}
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

        {/* Ambient controls (shown for ambient and hybrid) */}
        {(behaviorType === 'ambient' || behaviorType === 'hybrid') && (
          <div className="space-y-1.5">
            {behaviorType === 'hybrid' && (
              <>
                <div className="text-[10px] text-gray-400">Ambient lane</div>
                <div className="text-[10px] text-gray-500">
                  Hybrid always runs both lanes. This selects ambient bed style only.
                </div>
              </>
            )}
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
            {behaviorType === 'ambient' && (
              <div className="text-[10px] text-gray-500">
                {AMBIENT_MODES.find((m) => m.value === ambientMode)?.description}
              </div>
            )}
            {ambientMode === 'arpeggio' && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Arp Shape</div>
                <div className="grid grid-cols-5 gap-1">
                  {Object.entries(ARP_SHAPES).map(([key, { label, degrees }]) => {
                    const selected = (config.patternType ?? 'walk') === key;
                    return (
                      <button
                        key={key}
                        onClick={() => onUpdate({ patternType: key })}
                        className="flex flex-col items-center gap-0.5 py-1 rounded transition-colors"
                        style={{
                          background: selected ? '#5c7285' : '#333',
                          color: selected ? '#fff' : '#888',
                        }}
                      >
                        <ShapeSVG degrees={degrees} width={32} height={14} color={selected ? '#fff' : '#888'} />
                        <span className="text-[9px]">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
                onChange={(e) => onUpdate({ smoothingMs: parseInt(e.target.value, 10) })}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#5c7285' }}
              />
            </div>
            {ambientMode === 'sample' && (
              <SampleEngineControls config={config} onUpdate={onUpdate} />
            )}
          </div>
        )}

        {/* Event controls (shown for event and hybrid) */}
        {(behaviorType === 'event' || behaviorType === 'hybrid') && (
          <div className="space-y-2">
            {behaviorType === 'hybrid' && (
              <div className="text-[10px] text-gray-400 pt-1">Event lane</div>
            )}
            <EventControls
              config={config}
              onUpdate={onUpdate}
              showDescription={behaviorType === 'event'}
            />
            {behaviorType === 'hybrid' && (
              <>
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
                    onChange={(e) => onUpdate({ hybridAccent: parseFloat(e.target.value) })}
                    className="w-full h-1 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#b8860b' }}
                  />
                </div>
                <div className="text-[10px] text-gray-500">
                  Hybrid blends a continuous ambient bed with sparse note accents from incoming events.
                </div>
              </>
            )}
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
                onClick={() => onUpdate({ alertTier: tier.value })}
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
            onChange={(e) => onUpdate({ beaconThreshold: parseFloat(e.target.value) })}
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
            onChange={(e) => onUpdate({ beaconPeriodicSec: parseInt(e.target.value, 10) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#888' }}
          />
          <div className="text-[9px] text-gray-500">0 disables periodic check-in beacons.</div>
        </div>
        <label className="text-[10px] text-gray-400 inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={config.beaconOnExtrema ?? false}
            onChange={(e) => onUpdate({ beaconOnExtrema: e.target.checked })}
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
      </div>}
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
