"use client";

import { useEffect, useRef, useCallback } from "react";
import * as Tone from 'tone';
import type { AudioEngine } from '@/lib/audio-engine';
import type { DataPoint } from '@/types/stream';

interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  distance: number;
  frequency: number;
  callsign?: string;
  vector?: {
    latPerSecond: number;
    lonPerSecond: number;
    lastUpdated: number;
  };
}

interface WikiEdit {
  title: string;
  url: string;
  size: number;
  age: number;
  id: string;
  position: { x: number; y: number };
}

interface VisualizerProps {
  weatherAnalyzer: Tone.Analyser | null;
  flights: ProcessedFlight[];
  flightAnalyzer: Tone.Analyser | null;
  myLat: number;
  myLon: number;
  wikiAnalyzer: Tone.Analyser | null;
  engine: AudioEngine | null;
}

const DISTANCE_CIRCLES = [1, 5, 10];
const GEO_SCALE = 3;
const STREAM_COLORS = {
  weather: '#7C444F',
  flights: '#5C7285',
  wiki: '#4d6c81',
};

function hash32(input: string): number {
  // FNV-1a 32-bit hash for stable deterministic placement.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

const Visualizer = ({
  weatherAnalyzer,
  flights,
  flightAnalyzer,
  myLat,
  myLon,
  wikiAnalyzer,
  engine,
}: VisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editsRef = useRef<WikiEdit[]>([]);
  const flightsRef = useRef<ProcessedFlight[]>(flights);
  const airplaneImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameMsRef = useRef<number>(0);

  flightsRef.current = flights;

  // Load airplane image
  useEffect(() => {
    const img = new Image();
    img.src = '/airplane.svg';
    img.onload = () => { airplaneImgRef.current = img; };
  }, []);

  // Listen for wiki edits from AudioEngine (no duplicate SSE)
  useEffect(() => {
    if (!engine) return;

    engine.onData('viz-wiki', (dp: DataPoint) => {
      const f = dp.fields;
      const title = String(f.title ?? '');
      const absLen = typeof f.absLengthDelta === 'number' ? f.absLengthDelta : 10;
      const editSize = Math.min(100, Math.max(10, absLen));
      const w = containerRef.current?.clientWidth || 400;
      const h = containerRef.current?.clientHeight || 400;
      const hx = hash32(`${title}|x`);
      const hy = hash32(`${title}|y`);
      const x = (hx / 0xffffffff) * (w - 100) + 50;
      const y = (hy / 0xffffffff) * (h - 100) + 50;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

      editsRef.current = [{
        title,
        url,
        size: editSize,
        age: 0,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        position: { x, y },
      }, ...editsRef.current].slice(0, 50);
    }, 'wikipedia');

    return () => { engine.offData('viz-wiki'); };
  }, [engine]);

  // Age edits
  useEffect(() => {
    const interval = setInterval(() => {
      editsRef.current = editsRef.current
        .map((e) => ({ ...e, age: e.age + 0.1 }))
        .filter((e) => e.age < 30);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Canvas resize — fill container (no longer square)
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const now = performance.now();
    if (now - lastFrameMsRef.current < 1000 / 45) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    lastFrameMsRef.current = now;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h);
    const latScale = scale * GEO_SCALE;
    const lonScale = scale * GEO_SCALE;

    // Distance circles
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.3)';
    ctx.lineWidth = 1;
    for (const miles of DISTANCE_CIRCLES) {
      const rLat = (miles / 69) * latScale;
      const rLon = (miles / 69) * lonScale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rLon, rLat, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // User dot
    ctx.fillStyle = 'rgba(255, 60, 60, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Flights
    const currentFlights = flightsRef.current;
    const airplane = airplaneImgRef.current;
    for (const flight of currentFlights) {
      const latDiff = flight.lat - myLat;
      const lonDiff = flight.lon - myLon;
      const x = cx + lonDiff * lonScale;
      const y = cy - latDiff * latScale;
      const size = lerp(1 / flight.distance, 0, 1, 20, 60);
      const margin = 100;

      if (x < -margin || x > w + margin || y < -margin || y > h + margin) continue;

      ctx.save();
      ctx.translate(x, y);

      if (flight.vector) {
        const { latPerSecond, lonPerSecond } = flight.vector;
        if (Math.abs(latPerSecond) > 0.00001 || Math.abs(lonPerSecond) > 0.00001) {
          const angle = Math.atan2(-latPerSecond, lonPerSecond) - Math.PI / 2;
          ctx.rotate(angle);

          ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          const vs = 50;
          ctx.lineTo(lonPerSecond * vs, -latPerSecond * vs);
          ctx.stroke();
          ctx.rotate(-angle);
          ctx.rotate(angle);
        }
      }

      if (airplane && airplane.complete) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(airplane, -size / 2, -size / 2, size, size);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(92, 114, 133, 0.7)';
      ctx.font = '11px var(--font-geist-mono, monospace)';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(flight.distance)} mi`, x, y - size / 2 - 8);
    }

    // Wiki edits
    for (const edit of editsRef.current) {
      const { x, y } = edit.position;
      const maxSize = edit.size;
      const currentSize = maxSize * (1 - edit.age / 60);

      for (let i = 3; i >= 0; i--) {
        const rippleSize = currentSize * (1 + i * 0.3);
        const alpha = lerp(i, 0, 3, 0.5, 0.08);
        ctx.strokeStyle = `rgba(77, 108, 129, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, rippleSize / 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = STREAM_COLORS.wiki;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();

      if (edit.size > 30 && edit.age < 20) {
        const displayTitle = edit.title.length > 30
          ? edit.title.substring(0, 27) + '...'
          : edit.title;
        ctx.fillStyle = 'rgba(92, 114, 133, 0.6)';
        ctx.font = '12px var(--font-geist-sans, sans-serif)';
        ctx.textAlign = 'center';
        ctx.fillText(displayTitle, x, y + currentSize);
      }
    }

    // Waveforms at bottom
    const waveformY0 = h - 44;
    const waveformY1 = h - 8;
    const drawWaveform = (analyzer: Tone.Analyser, color: string) => {
      const data = analyzer.getValue() as Float32Array;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const px = lerp(i, 0, data.length, 0, w);
        const py = lerp(data[i], -1, 1, waveformY0, waveformY1);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    if (wikiAnalyzer) drawWaveform(wikiAnalyzer, STREAM_COLORS.wiki);
    if (flightAnalyzer) drawWaveform(flightAnalyzer, STREAM_COLORS.flights);
    if (weatherAnalyzer) drawWaveform(weatherAnalyzer, STREAM_COLORS.weather);

    rafRef.current = requestAnimationFrame(draw);
  }, [myLat, myLon, weatherAnalyzer, flightAnalyzer, wikiAnalyzer]);

  // Animation loop
  useEffect(() => {
    lastFrameMsRef.current = 0;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h);
    const latScale = scale * GEO_SCALE;
    const lonScale = scale * GEO_SCALE;

    for (const flight of flightsRef.current) {
      if (!flight.callsign) continue;
      const latDiff = flight.lat - myLat;
      const lonDiff = flight.lon - myLon;
      const x = cx + lonDiff * lonScale;
      const y = cy - latDiff * latScale;
      const size = lerp(1 / flight.distance, 0, 1, 20, 60);
      const dx = mx - x;
      const dy = my - y;
      if (Math.sqrt(dx * dx + dy * dy) < size / 2) {
        window.open(`https://api.adsbdb.com/v0/callsign/${flight.callsign}`, '_blank');
        return;
      }
    }

    for (const edit of editsRef.current) {
      const dx = mx - edit.position.x;
      const dy = my - edit.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < 20 && edit.url) {
        window.open(edit.url, '_blank');
        return;
      }
    }
  }, [myLat, myLon]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ cursor: 'pointer', display: 'block' }}
      />
    </div>
  );
};

export default Visualizer;
