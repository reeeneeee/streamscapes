"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import * as Tone from 'tone';
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
import type { ProcessedFlight } from '@/types/flight';

type Tab = 'listen' | 'controls';

const STEP_ICONS: Record<number, ReactNode> = {
  1: ( // Equalizer bars
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="8" width="2.5" height="6" rx="1" fill="rgba(245,240,235,0.5)" />
      <rect x="6.75" y="4" width="2.5" height="10" rx="1" fill="rgba(245,240,235,0.5)" />
      <rect x="11.5" y="6" width="2.5" height="8" rx="1" fill="rgba(245,240,235,0.5)" />
    </svg>
  ),
  2: ( // Flowing streams
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4Q5 3 8 4Q11 5 14 4" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 8Q5 7 8 8Q11 9 14 8" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 12Q5 11 8 12Q11 13 14 12" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  3: ( // Tuning/resonance circle
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.5" fill="rgba(245,240,235,0.5)" />
      <line x1="8" y1="1" x2="8" y2="3" stroke="rgba(245,240,235,0.35)" strokeWidth="1" strokeLinecap="round" />
      <line x1="8" y1="13" x2="8" y2="15" stroke="rgba(245,240,235,0.35)" strokeWidth="1" strokeLinecap="round" />
      <line x1="1" y1="8" x2="3" y2="8" stroke="rgba(245,240,235,0.35)" strokeWidth="1" strokeLinecap="round" />
      <line x1="13" y1="8" x2="15" y2="8" stroke="rgba(245,240,235,0.35)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  4: ( // Diamond compass
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L13 8L8 14L3 8Z" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.5" fill="rgba(245,240,235,0.5)" />
    </svg>
  ),
  5: ( // Sine wave
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8Q3 4 5 8Q7 12 9 8Q11 4 13 8Q14 10 15 8" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  6: ( // Mapping arrows
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4H10M10 4L7 1.5M10 4L7 6.5" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 12H6M6 12L9 9.5M6 12L9 14.5" stroke="rgba(245,240,235,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  7: ( // Polish/sparkle
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5Z" stroke="rgba(245,240,235,0.5)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
};

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
  const header = (
    <div
      className={`px-1 ${collapsible ? 'cursor-pointer select-none' : ''}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="step-label">Step {step}</div>
      <div className="flex items-center gap-2">
        {STEP_ICONS[step]}
        <div className="step-title">{title}</div>
        {collapsible && (
          <svg
            width="14" height="14" viewBox="0 0 14 14"
            style={{
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              opacity: 0.4,
              flexShrink: 0,
            }}
          >
            <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {actions}
      </div>
      {(expanded || !collapsible) && (
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{description}</div>
      )}
    </div>
  );

  return (
    <section className="space-y-2">
      {header}
      {(!collapsible || expanded) && children}
    </section>
  );
}

export default function Main() {
  const { location } = useUserLocation();
  const { engine, plugins, startAudio, stopAudio, isPlaying } = useStreamscapes(location.lat, location.lon);

  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);

  const [tab, setTab] = useState<Tab>('listen');
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

  const handleStop = useCallback(() => {
    stopAudio();
    setProcessedFlights([]);
    setWeatherDisplay(null);
    setWeatherAnalyzer(null);
    setFlightAnalyzer(null);
    setWikiAnalyzer(null);
  }, [stopAudio]);

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Not playing — show start screen
  if (!isPlaying) {
    return (
      <div
        className="h-[100dvh] flex flex-col items-center justify-center relative cursor-pointer"
        onClick={startAudio}
      >
        <div className="atmosphere"><div className="atmosphere-blob atmosphere-rose" /><div className="atmosphere-blob atmosphere-blue" /><div className="atmosphere-blob atmosphere-green" /></div>
        <div className="vignette" />
        <h1
          className="relative z-10"
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 'clamp(48px, 8vw, 96px)',
            fontWeight: 300,
            color: 'var(--text-primary)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          streamscapes
        </h1>
        <p
          className="relative z-10"
          style={{
            fontFamily: 'var(--font-body, var(--ff-body))',
            fontSize: 14,
            fontWeight: 400,
            color: 'rgba(245, 240, 235, 0.25)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginTop: 80,
          }}
        >
          plug in
        </p>
        {isIOS && (
          <p
            className="relative z-10"
            style={{
              fontFamily: 'var(--font-body, var(--ff-body))',
              fontSize: 12,
              fontWeight: 400,
              color: 'rgba(245, 240, 235, 0.15)',
              marginTop: 24,
            }}
          >
            turn off silent mode for sound
          </p>
        )}
      </div>
    );
  }

  const vizHeight = 'calc(100dvh - var(--tab-bar-height) - var(--transport-height))';

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden relative">
      {/* Atmospheric background */}
      <div className="atmosphere"><div className="atmosphere-blob atmosphere-rose" /><div className="atmosphere-blob atmosphere-blue" /><div className="atmosphere-blob atmosphere-green" /></div>
      <div className="vignette" />

      {/* Tab bar */}
      <div className="tab-bar">
        <span className="logo">streamscapes</span>
        <div className="flex-1" />
        <div className="tab-group">
          <button data-active={tab === 'listen'} onClick={() => setTab('listen')}>
            Listen
          </button>
          <button data-active={tab === 'controls'} onClick={() => setTab('controls')}>
            Controls
          </button>
        </div>
        <div className="flex-1" />
        {weatherDisplay && (
          <div className="text-[12px] hidden sm:block" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
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
        <div className="relative z-[5]" style={{ height: vizHeight }}>
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
          className="controls-scroll p-4 space-y-6 relative z-[5]"
          style={{ height: vizHeight }}
        >
          <SettingsStep
            step={1}
            title="Quick Mix"
            description="Live meters plus mute/solo/level controls."
          >
            <Mixer engine={engine} />
          </SettingsStep>

          <div className="space-y-3">
            <SettingsStep
              step={2}
              title="Choose Stream"
              description="Activate streams to listen. Solo a stream to hear it alone."
              collapsible
              expanded={guidedStep === 2}
              onToggle={() => setGuidedStep(guidedStep === 2 ? 0 : 2)}
            >
              <StreamBrowser plugins={plugins} />
            </SettingsStep>

            <SettingsStep
              step={3}
              title="Set Global Musical Frame"
              description="Root note, scale, and tempo define shared context across streams."
              collapsible
              expanded={guidedStep === 3}
              onToggle={() => setGuidedStep(guidedStep === 3 ? 0 : 3)}
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
              step={4}
              title="Pick A Starting Intent"
              description={lockGlobalFrame
                ? 'Use presets to land quickly on a coherent listening mode. Global frame is locked.'
                : 'Use presets to land quickly on a coherent listening mode.'}
              collapsible
              expanded={guidedStep === 4}
              onToggle={() => setGuidedStep(guidedStep === 4 ? 0 : 4)}
            >
              <Presets lockGlobalFrame={lockGlobalFrame} />
            </SettingsStep>

            <SettingsStep
              step={5}
              title="Shape Active Stream Behavior"
              description="Choose ambient/event/hybrid behavior and stream-level articulation."
              collapsible
              expanded={guidedStep === 5}
              onToggle={() => setGuidedStep(guidedStep === 5 ? 0 : 5)}
            >
              <SonificationPanel />
            </SettingsStep>

            <SettingsStep
              step={6}
              title="Map Data To Sound"
              description="Decide what each data field controls and how sensitive it is."
              collapsible
              expanded={guidedStep === 6}
              onToggle={() => setGuidedStep(guidedStep === 6 ? 0 : 6)}
            >
              <MappingEditor engine={engine} />
            </SettingsStep>

            <SettingsStep
              step={7}
              title="Polish Tone And Space"
              description="Use effects after mapping to refine color without changing semantics."
              collapsible
              expanded={guidedStep === 7}
              onToggle={() => setGuidedStep(guidedStep === 7 ? 0 : 7)}
            >
              <EffectsChain />
            </SettingsStep>
          </div>
        </div>
      )}

      {/* Transport bar */}
      <TransportBar engine={engine} onStop={handleStop} />
    </div>
  );
}
