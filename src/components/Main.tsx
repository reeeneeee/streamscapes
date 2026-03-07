"use client";

import { useEffect, useState, useCallback } from "react";
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

type Tab = 'listen' | 'controls';

interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  distance: number;
  frequency: number;
  callsign?: string;
}

export default function Main() {
  const { location } = useUserLocation();
  const { engine, plugins, startAudio, isPlaying } = useStreamscapes(location.lat, location.lon);

  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);

  const [tab, setTab] = useState<Tab>('listen');
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

        {/* Weather info in tab bar */}
        <div className="flex-1" />
        {weatherDisplay && (
          <div className="text-[11px] hidden sm:block" style={{ color: 'var(--text-muted)' }}>
            {location.lat.toFixed(2)}, {location.lon.toFixed(2)}
            {' \u00B7 '}
            {Math.trunc(weatherDisplay.feelsLike)}\u00B0F
            {' \u00B7 '}
            {weatherDisplay.clouds}% clouds
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
          {/* Mixer at top */}
          <Mixer engine={engine} />

          {/* Two-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-3">
              <StreamBrowser plugins={plugins} />
              <GlobalControls />
              <Presets />
            </div>
            <div className="space-y-3">
              <SonificationPanel />
              <EffectsChain />
              <MappingEditor engine={engine} />
            </div>
          </div>
        </div>
      )}

      {/* Transport bar */}
      <TransportBar engine={engine} onStop={() => {}} />
    </div>
  );
}
