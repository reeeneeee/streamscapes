"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import type * as Tone from 'tone';
import { useUserLocation } from '../hooks/useUserLocation';
import { useStreamscapes } from '../hooks/useStreamscapes';
import { useStore } from '@/store';
import Visualizer from './Visualizer';
import Mixer from './Mixer';
import GlobalControls from './GlobalControls';
import SonificationPanel from './SonificationPanel';
import EffectsChain from './EffectsChain';
import TransportBar from './TransportBar';
import ErrorFeed from './ErrorFeed';
import PresetsPanel from './PresetsPanel';
import ConnectionsPanel from './ConnectionsPanel';
import RecorderPanel from './RecorderPanel';
import NowPlayingBar from './NowPlayingBar';
import InstallPrompt from './InstallPrompt';
import AuthButton from './AuthButton';
import type { DataPoint } from '@/types/stream';
import type { ProcessedFlight } from '@/types/flight';

type Tab = 'main' | 'datastreams' | 'config' | 'record';

function AdvancedConfig({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
        style={{ padding: '6px 4px' }}
      >
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            opacity: 0.4,
            flexShrink: 0,
          }}
        >
          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(245, 240, 235, 0.35)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
          }}
        >
          Advanced Configuration
        </span>
      </button>
      {open && <div className="space-y-4 mt-2">{children}</div>}
    </div>
  );
}

export default function Main() {
  const { location, denied, dismissBanner } = useUserLocation();
  const { engine, startAudio, stopAudio, isPlaying } = useStreamscapes(location.lat, location.lon);

  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);

  const [tab, setTab] = useState<Tab>('main');
  const [processedFlights, setProcessedFlights] = useState<ProcessedFlight[]>([]);
  const [weatherDisplay, setWeatherDisplay] = useState<{ feelsLike: number; clouds: number } | null>(null);

  const [flightAnalyzer, setFlightAnalyzer] = useState<Tone.Analyser | null>(null);
  const [wikiAnalyzer, setWikiAnalyzer] = useState<Tone.Analyser | null>(null);

  // Load shared preset from URL (?preset=slug)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('preset');
    if (!slug) return;
    // Remove from URL to avoid re-loading on refresh
    window.history.replaceState({}, '', window.location.pathname);
    fetch(`/api/presets/${slug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        if (data.globalConfig) useStore.getState().updateGlobal(data.globalConfig);
        if (data.channelsConfig) {
          for (const [id, config] of Object.entries(data.channelsConfig)) {
            useStore.getState().updateChannel(id, config as Record<string, unknown>);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Keyboard shortcuts: 1 = Main, 2 = Inputs, 3 = Sonifications, 4 = Record
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === '1') setTab('main');
      if (e.key === '2') setTab('datastreams');
      if (e.key === '3') setTab('config');
      if (e.key === '4') setTab('record');
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
      const now = Date.now();
      setProcessedFlights((prev) => {
        const id = String(f.flightId);
        // Prune flights gone for 40s — must exceed the 15s poll interval plus
        // latency, or every record gets pruned moments before its own update
        // arrives and the smooth blend never gets a previous position.
        const fresh = prev.filter((p) => now - p.lastSeen < 40_000);
        const existing = fresh.find((p) => p.fr24_id === id);

        // Capture previous interpolated position for smooth blending
        let prevLat: number | undefined;
        let prevLon: number | undefined;
        let prevTime: number | undefined;
        if (existing) {
          // Dead-reckon the old position to where it would be right now
          const elapsed = Math.min((now - existing.lastSeen) / 1000, 30);
          const degPerSec = existing.gspeed / 216000;
          const trackRad = (existing.track * Math.PI) / 180;
          prevLat = existing.lat + degPerSec * Math.cos(trackRad) * elapsed;
          prevLon = existing.lon + degPerSec * Math.sin(trackRad) * elapsed / Math.cos((existing.lat * Math.PI) / 180);
          prevTime = now;
        }

        const flight: ProcessedFlight = {
          fr24_id: id,
          lat: f.lat as number,
          lon: f.lon as number,
          // Stream yields mph; dead-reckoning (gspeed / 216000) expects knots
          gspeed: (f.speed as number) / 1.15078,
          distance: f.distance as number,
          frequency: f.frequency as number,
          callsign: f.callsign as string | undefined,
          track: (f.track as number) ?? 0,
          lastSeen: now,
          prevLat,
          prevLon,
          prevTime,
        };
        const idx = fresh.findIndex((p) => p.fr24_id === id);
        if (idx >= 0) {
          const next = [...fresh];
          next[idx] = flight;
          return next;
        }
        return [...fresh, flight];
      });
    }, 'flights');

    engine.onData('main-weather-temp', (dp: DataPoint) => {
      if (dp.streamId !== 'weather:temp') return;
      setWeatherDisplay((prev) => ({
        feelsLike: dp.fields.feelsLike as number,
        clouds: prev?.clouds ?? 0,
      }));
    }, 'weather:temp');

    engine.onData('main-weather-clouds', (dp: DataPoint) => {
      if (dp.streamId !== 'weather:clouds') return;
      setWeatherDisplay((prev) => ({
        feelsLike: prev?.feelsLike ?? 60,
        clouds: dp.fields.clouds as number,
      }));
    }, 'weather:clouds');

    return () => {
      engine.offData('main-flights');
      engine.offData('main-weather-temp');
      engine.offData('main-weather-clouds');
    };
  }, [engine]);

  // Grab analyzers once engine is ready
  useEffect(() => {
    if (!engine || !isPlaying) return;
    const t = setTimeout(() => {
      setFlightAnalyzer(engine.getChannelAnalyzer('flights'));
      setWikiAnalyzer(engine.getChannelAnalyzer('wikipedia'));
    }, 500);
    return () => clearTimeout(t);
  }, [engine, isPlaying]);

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Not playing — show start screen
  if (!isPlaying) {
    return (
      <div
        className="h-[100dvh] flex flex-col items-center justify-center relative cursor-pointer"
        onClick={startAudio}
      >
        <div className="atmosphere"><div className="atmosphere-blob atmosphere-rose" /><div className="atmosphere-blob atmosphere-blue" /><div className="atmosphere-blob atmosphere-green" /></div>
        <div className="vignette" />
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20 }} onClick={(e) => e.stopPropagation()}>
          <AuthButton />
        </div>
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
          listen in
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
          <button data-active={tab === 'main'} onClick={() => setTab('main')}>
            Main
          </button>
          <button data-active={tab === 'datastreams'} onClick={() => setTab('datastreams')}>
            Inputs
          </button>
          <button data-active={tab === 'config'} onClick={() => setTab('config')}>
            Sonifications
          </button>
          <button data-active={tab === 'record'} onClick={() => setTab('record')}>
            Record
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          {weatherDisplay && (
            <div className="text-[12px] hidden lg:block" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              {location.lat.toFixed(2)}, {location.lon.toFixed(2)}
              {' \u00B7 '}
              {Math.trunc(weatherDisplay.feelsLike)}{'°F'}
              {' \u00B7 '}
              {weatherDisplay.clouds}% cloud cover
            </div>
          )}
          <AuthButton />
        </div>
      </div>

      {/* Main tab — visualizer only */}
      <div className="relative z-[5] overflow-hidden" style={{ height: vizHeight, display: tab === 'main' ? 'block' : 'none' }}>
        <Visualizer
          flights={processedFlights}
          flightAnalyzer={flightAnalyzer}
          myLat={location.lat}
          myLon={location.lon}
          wikiAnalyzer={wikiAnalyzer}
          engine={engine}
        />
      </div>

      {/* Inputs tab — mixer + connections */}
      <div
        className="controls-scroll px-2 py-3 sm:p-4 space-y-6 relative z-[5]"
        style={{ height: vizHeight, display: tab === 'datastreams' ? 'block' : 'none', overflowX: 'hidden' }}
      >
        <Mixer engine={engine} />
        <div className="sm:hidden px-3 py-4 text-center">
          <div style={{
            fontFamily: 'var(--font-body, var(--ff-body))',
            fontSize: 11,
            color: 'rgba(245, 240, 235, 0.2)',
            lineHeight: 1.6,
          }}>
            Chrome extension and macOS menu bar agent available on desktop. iOS app coming soon on TestFlight.
          </div>
        </div>
        <div className="hidden sm:block">
          <ConnectionsPanel />
        </div>
      </div>

      {/* Record tab — capture soundscape + mic */}
      <div
        className="controls-scroll px-2 py-3 sm:p-4 relative z-[5]"
        style={{ height: vizHeight, display: tab === 'record' ? 'block' : 'none' }}
      >
        <RecorderPanel engine={engine} />
      </div>

      {/* Configure tab — sound shaping */}
      <div
        className="controls-scroll px-2 py-3 sm:p-4 space-y-6 relative z-[5]"
        style={{ height: vizHeight, display: tab === 'config' ? 'block' : 'none' }}
      >
          {/* Presets — save, share, community */}
          <div className="px-1">
            <PresetsPanel />
          </div>

          {/* Global musical frame — always visible */}
          <div className="px-1">
            <div className="step-title mb-1" style={{ fontSize: 13 }}>Global</div>
            <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
              Root note, scale, and tempo shared across all streams.
            </div>
            <GlobalControls />
          </div>

          {/* Intent presets — always visible */}
          <SonificationPanel showAdvanced={false} />

          {/* Detailed sonification — collapsible (desktop only) */}
          {!isMobile && (
            <AdvancedConfig>
              <SonificationPanel showAdvanced />
              <EffectsChain />
            </AdvancedConfig>
          )}

          {/* Factory reset */}
          <div className="pt-4 pb-8">
            <button
              onClick={() => {
                if (!window.confirm('Reset all audio settings to defaults?')) return;
                useStore.getState().resetAudioConfig();
              }}
              className="w-full text-[11px] px-2 py-1.5 rounded"
              style={{
                background: 'rgba(60, 30, 30, 0.6)',
                color: 'rgba(248, 140, 140, 0.7)',
                border: '1px solid rgba(248, 140, 140, 0.15)',
              }}
            >
              Factory Reset Audio Config
            </button>
          </div>
      </div>

      {/* Error feed overlay for OTLP errors */}
      <ErrorFeed engine={engine} />

      {/* Location fallback banner */}
      {denied && location.isRandom && location.label && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(var(--tab-bar-height, 44px) + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            borderRadius: 10,
            background: 'rgba(30, 30, 30, 0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body, var(--ff-body))',
              fontSize: 12,
              color: 'rgba(245, 240, 235, 0.6)',
              lineHeight: 1.4,
            }}
          >
            Dropped you near <strong style={{ color: 'rgba(245, 240, 235, 0.85)' }}>{location.label}</strong>.
            {' '}Enable location sharing for local flights and weather.
          </span>
          <button
            onClick={dismissBanner}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(245, 240, 235, 0.3)',
              fontSize: 16,
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Install prompt — web only, dismissable */}
      <InstallPrompt />
      <NowPlayingBar />

      {/* Transport bar */}
      <TransportBar engine={engine} />
    </div>
  );
}
