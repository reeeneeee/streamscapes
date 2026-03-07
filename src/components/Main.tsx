"use client";

import { useEffect, useState } from "react";
import * as Tone from 'tone';
import { useUserLocation } from '../hooks/useUserLocation';
import { useStreamscapes } from '../hooks/useStreamscapes';
import { useStore } from '@/store';
import Visualizer from './Visualizer';
import Mixer from './Mixer';
import type { DataPoint } from '@/types/stream';

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
  const { engine, startAudio, isPlaying } = useStreamscapes(location.lat, location.lon);

  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const updateGlobal = useStore((s) => s.updateGlobal);

  // Flight data for visualizer
  const [processedFlights, setProcessedFlights] = useState<ProcessedFlight[]>([]);
  const [weatherDisplay, setWeatherDisplay] = useState<{ feelsLike: number; clouds: number } | null>(null);

  // Analyzer refs for visualizer
  const [weatherAnalyzer, setWeatherAnalyzer] = useState<Tone.Analyser | null>(null);
  const [flightAnalyzer, setFlightAnalyzer] = useState<Tone.Analyser | null>(null);
  const [wikiAnalyzer, setWikiAnalyzer] = useState<Tone.Analyser | null>(null);

  // Listen for data from streams to update UI
  useEffect(() => {
    if (!engine) return;

    engine.onData('flights', (dp: DataPoint) => {
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
    });

    engine.onData('weather', (dp: DataPoint) => {
      setWeatherDisplay({
        feelsLike: dp.fields.feelsLike as number,
        clouds: dp.fields.clouds as number,
      });
    });

    return () => {
      engine.offData('flights');
      engine.offData('weather');
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

  const currentScale = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'];

  return (
    <div>
      {/* Header */}
      <div className="w-full flex flex-col items-center mt-4 mb-6">
        {!isPlaying ? (
          <button
            onClick={startAudio}
            style={{ backgroundColor: '#2d2d2d', color: '#f5f5f5' }}
            className="px-6 py-3 rounded-lg text-lg hover:opacity-90 transition-opacity"
          >
            Start Synth
          </button>
        ) : (
          /* Weather info line */
          weatherDisplay && (
            <div className="text-sm text-center opacity-70">
              📍 {location.lat.toFixed(4)}, {location.lon.toFixed(4)} &middot;
              🌡️ {Math.trunc(weatherDisplay.feelsLike)}°F &middot;
              ☁️ {weatherDisplay.clouds}%
            </div>
          )
        )}
      </div>

      {/* Visualizer */}
      {isPlaying && wikiAnalyzer && flightAnalyzer && weatherAnalyzer && (
        <div className="mb-6">
          <Visualizer
            weatherAnalyzer={weatherAnalyzer}
            flights={processedFlights}
            flightAnalyzer={flightAnalyzer}
            myLat={location.lat}
            myLon={location.lon}
            wikiAnalyzer={wikiAnalyzer}
            backgroundColor="#f5f5f5"
            scale={currentScale}
          />
        </div>
      )}

      {/* Mixer */}
      {isPlaying && (
        <Mixer engine={engine} />
      )}
    </div>
  );
}
