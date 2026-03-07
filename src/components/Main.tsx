"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import * as Tone from 'tone';
import Scale from '@tonaljs/scale';
import { useUserLocation } from '../hooks/useUserLocation';
import { useStreamscapes } from '../hooks/useStreamscapes';
import { useStore } from '@/store';
import Visualizer from './Visualizer';
import Mixer from './Mixer';
import StreamBrowser from './StreamBrowser';
import GlobalControls from './GlobalControls';
import SonificationPanel from './SonificationPanel';
import EffectsChain from './EffectsChain';
import MappingEditor from './MappingEditor';
import Presets from './Presets';
import TransportBar from './TransportBar';
import type { DataPoint } from '@/types/stream';
import { genericChannelPatch } from '@/lib/generic-settings';

type Tab = 'listen' | 'controls';
type ControlsViewMode = 'guided' | 'all';

interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  distance: number;
  frequency: number;
  callsign?: string;
}

function SettingsStep({
  step,
  title,
  description,
  children,
  collapsible = false,
  expanded = true,
  onToggle,
  actions,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="px-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">
          Step {step}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[12px] font-medium text-gray-200">{title}</div>
          {collapsible && (
            <button
              onClick={onToggle}
              className="text-[9px] px-1.5 py-0.5 rounded bg-[#333] text-gray-300 hover:text-white"
            >
              {expanded ? 'Hide' : 'Show'}
            </button>
          )}
          {actions}
        </div>
        <div className="text-[10px] text-gray-500">{description}</div>
      </div>
      {(!collapsible || expanded) && children}
    </section>
  );
}

export default function Main() {
  const { location } = useUserLocation();
  const { engine, plugins, startAudio, isPlaying } = useStreamscapes(location.lat, location.lon);

  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const updateChannel = useStore((s) => s.updateChannel);

  const [tab, setTab] = useState<Tab>('listen');
  const [controlsViewMode, setControlsViewMode] = useState<ControlsViewMode>('guided');
  const [guidedStep, setGuidedStep] = useState<number>(1);
  const [lockGlobalFrame, setLockGlobalFrame] = useState<boolean>(true);
  const [processedFlights, setProcessedFlights] = useState<ProcessedFlight[]>([]);
  const [weatherDisplay, setWeatherDisplay] = useState<{ feelsLike: number; clouds: number } | null>(null);

  const [weatherAnalyzer, setWeatherAnalyzer] = useState<Tone.Analyser | null>(null);
  const [flightAnalyzer, setFlightAnalyzer] = useState<Tone.Analyser | null>(null);
  const [wikiAnalyzer, setWikiAnalyzer] = useState<Tone.Analyser | null>(null);

  // Keyboard shortcuts: 1 = Listen, 2 = Controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === '1') setTab('listen');
      if (e.key === '2') setTab('controls');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for data from streams
  useEffect(() => {
    if (!engine) return;

    engine.onData('main-flights', (dp: DataPoint) => {
      if (dp.streamId !== 'flights') return;
      const f = dp.fields;
      setProcessedFlights((prev) => {
        const id = String(f.flightId);
        const flight: ProcessedFlight = {
          fr24_id: id,
          lat: f.lat as number,
          lon: f.lon as number,
          gspeed: f.speed as number,
          distance: f.distance as number,
          frequency: f.frequency as number,
          callsign: f.callsign as string | undefined,
        };
        const idx = prev.findIndex((p) => p.fr24_id === id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = flight;
          return next;
        }
        return [...prev, flight];
      });
    }, 'flights');

    engine.onData('main-weather', (dp: DataPoint) => {
      if (dp.streamId !== 'weather') return;
      setWeatherDisplay({
        feelsLike: dp.fields.feelsLike as number,
        clouds: dp.fields.clouds as number,
      });
    }, 'weather');

    return () => {
      engine.offData('main-flights');
      engine.offData('main-weather');
    };
  }, [engine]);

  // Grab analyzers once engine is ready
  useEffect(() => {
    if (!engine || !isPlaying) return;
    const t = setTimeout(() => {
      setWeatherAnalyzer(engine.getChannelAnalyzer('weather'));
      setFlightAnalyzer(engine.getChannelAnalyzer('flights'));
      setWikiAnalyzer(engine.getChannelAnalyzer('wikipedia'));
    }, 500);
    return () => clearTimeout(t);
  }, [engine, isPlaying]);

  const applyGenericToAll = useCallback(() => {
    const ids = Object.keys(channels);
    const heardId = ids.find((id) => channels[id].enabled) ?? null;
    for (const id of ids) {
      const cfg = channels[id];
      const patch = genericChannelPatch(id, cfg);
      updateChannel(id, {
        ...patch,
        enabled: heardId ? id === heardId : patch.enabled,
      });
    }
  }, [channels, updateChannel]);

  // Not playing — show start screen
  if (!isPlaying) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center gap-6">
        <h1 className="text-3xl font-light tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Streamscapes
        </h1>
        <p className="text-sm max-w-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Real-time data streams turned into sound
        </p>
        <button
          onClick={startAudio}
          className="px-8 py-3 rounded-lg text-base font-medium transition-all hover:scale-105"
          style={{
            background: 'var(--accent)',
            color: '#fff',
          }}
        >
          Start Listening
        </button>
      </div>
    );
  }

  const vizHeight = 'calc(100dvh - var(--tab-bar-height) - var(--transport-height))';

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="tab-bar">
        <button data-active={tab === 'listen'} onClick={() => setTab('listen')}>
          Listen
        </button>
        <button data-active={tab === 'controls'} onClick={() => setTab('controls')}>
          Controls
        </button>
        <button
          onClick={applyGenericToAll}
          className="ml-2 text-[10px] px-2 py-1 rounded bg-[#4ade80] text-black hover:brightness-95"
          title="Choose Generic Setting (All Streams)"
        >
          Choose Generic Setting
        </button>

        {/* Weather info in tab bar */}
        <div className="flex-1" />
        {weatherDisplay && (
          <div className="text-[11px] hidden sm:block" style={{ color: 'var(--text-muted)' }}>
            {location.lat.toFixed(2)}, {location.lon.toFixed(2)}
            {' \u00B7 '}
            {Math.trunc(weatherDisplay.feelsLike)}{'°F'}
            {' \u00B7 '}
            {weatherDisplay.clouds}% cloud cover
          </div>
        )}
      </div>

      {/* Tab content */}
      {tab === 'listen' ? (
        <div style={{ height: vizHeight }}>
          <Visualizer
            weatherAnalyzer={weatherAnalyzer}
            flights={processedFlights}
            flightAnalyzer={flightAnalyzer}
            myLat={location.lat}
            myLon={location.lon}
            wikiAnalyzer={wikiAnalyzer}
            engine={engine}
          />
        </div>
      ) : (
        <div
          className="controls-scroll p-3 space-y-3"
          style={{ height: vizHeight }}
        >
          <div className="panel">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="panel-title !mb-0">Quick Reset</div>
                <div className="text-[10px] text-gray-500">Always available: apply generic settings to all streams.</div>
              </div>
              <button
                onClick={applyGenericToAll}
                className="text-[10px] px-2 py-1 rounded bg-[#4ade80] text-black"
              >
                Choose Generic Setting (All)
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title !mb-1">Settings Workflow</div>
            <div className="text-[11px] text-gray-500">
              Recommended setup order: choose streams, set global frame, pick intent, shape behavior, map data, then polish effects.
            </div>
            <div className="mt-2 flex gap-1">
              <button
                onClick={() => setControlsViewMode('guided')}
                className="text-[10px] px-2 py-1 rounded"
                style={{
                  background: controlsViewMode === 'guided' ? '#555' : '#333',
                  color: controlsViewMode === 'guided' ? '#fff' : '#aaa',
                }}
              >
                Guided
              </button>
              <button
                onClick={() => setControlsViewMode('all')}
                className="text-[10px] px-2 py-1 rounded"
                style={{
                  background: controlsViewMode === 'all' ? '#555' : '#333',
                  color: controlsViewMode === 'all' ? '#fff' : '#aaa',
                }}
              >
                All Panels
              </button>
            </div>
          </div>

          <SettingsStep
            step={0}
            title="Quick Mix"
            description="Live meters plus mute/solo/level controls are always available here."
          >
            <Mixer engine={engine} />
          </SettingsStep>

          <div className="space-y-3">
            <SettingsStep
              step={1}
              title="Choose Stream"
              description="Pick one active stream to work on; switching keeps one shared global frame."
              collapsible={controlsViewMode === 'guided'}
              expanded={controlsViewMode === 'all' || guidedStep === 1}
              onToggle={() => setGuidedStep(guidedStep === 1 ? 0 : 1)}
            >
              <StreamBrowser plugins={plugins} />
            </SettingsStep>

            <SettingsStep
              step={2}
              title="Set Global Musical Frame"
              description="Root note, scale, and tempo define shared context across streams."
              collapsible={controlsViewMode === 'guided'}
              expanded={controlsViewMode === 'all' || guidedStep === 2}
              onToggle={() => setGuidedStep(guidedStep === 2 ? 0 : 2)}
              actions={(
                <label className="text-[9px] text-gray-300 flex items-center gap-1 ml-1">
                  <input
                    type="checkbox"
                    checked={lockGlobalFrame}
                    onChange={(e) => setLockGlobalFrame(e.target.checked)}
                  />
                  Lock Global Frame
                </label>
              )}
            >
              <GlobalControls />
            </SettingsStep>

            <SettingsStep
              step={3}
              title="Pick A Starting Intent"
              description={lockGlobalFrame
                ? 'Use presets to land quickly on a coherent listening mode. Global frame is locked.'
                : 'Use presets to land quickly on a coherent listening mode.'}
              collapsible={controlsViewMode === 'guided'}
              expanded={controlsViewMode === 'all' || guidedStep === 3}
              onToggle={() => setGuidedStep(guidedStep === 3 ? 0 : 3)}
            >
              <Presets lockGlobalFrame={lockGlobalFrame} />
            </SettingsStep>

            <SettingsStep
              step={4}
              title="Shape Active Stream Behavior"
              description="Choose ambient/event/hybrid behavior and stream-level articulation."
              collapsible={controlsViewMode === 'guided'}
              expanded={controlsViewMode === 'all' || guidedStep === 4}
              onToggle={() => setGuidedStep(guidedStep === 4 ? 0 : 4)}
            >
              <SonificationPanel />
            </SettingsStep>

            <SettingsStep
              step={5}
              title="Map Data To Sound"
              description="Decide what each data field controls and how sensitive it is."
              collapsible={controlsViewMode === 'guided'}
              expanded={controlsViewMode === 'all' || guidedStep === 5}
              onToggle={() => setGuidedStep(guidedStep === 5 ? 0 : 5)}
            >
              <MappingEditor engine={engine} />
            </SettingsStep>

            <SettingsStep
              step={6}
              title="Polish Tone And Space"
              description="Use effects after mapping to refine color without changing semantics."
              collapsible={controlsViewMode === 'guided'}
              expanded={controlsViewMode === 'all' || guidedStep === 6}
              onToggle={() => setGuidedStep(guidedStep === 6 ? 0 : 6)}
            >
              <EffectsChain />
            </SettingsStep>

            <div className="text-[10px] text-gray-500 px-1">
              Mix controls are available in <span className="font-mono">Quick Mix</span> above.
            </div>
          </div>
        </div>
      )}

      {/* Transport bar */}
      <TransportBar engine={engine} onStop={() => {}} />
    </div>
  );
}
