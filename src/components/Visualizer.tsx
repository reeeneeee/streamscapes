"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type * as Tone from 'tone';
import type { AudioEngine } from '@/lib/audio-engine';
import type { DataPoint } from '@/types/stream';
import type { ProcessedFlight } from '@/types/flight';
import { STREAM_COLORS, getStreamColor } from '@/lib/stream-constants';
import { archivePlayer } from '@/lib/archive-player';
import { useStore } from '@/store';

interface WikiEdit {
  title: string;
  url: string;
  size: number;
  age: number;
  id: string;
  /** Normalised 0-1 position derived from hash — converted to pixels at draw time */
  nx: number;
  ny: number;
}

/** Internet Archive change blob */
interface ArchiveBlob {
  identifier: string;
  title: string;
  mediatype: string;
  downloads: number;
  size: number;
  age: number;
  id: string;
  nx: number;
  ny: number;
}

/** Falling rain drop for personal ingest events */
interface IngestDrop {
  x: number;      // normalised 0-1 horizontal
  y: number;      // normalised 0 (top) → 1+ (off-screen)
  speed: number;  // normalised units per 30ms tick
  color: string;
  size: number;   // radius px
  opacity: number;
  label: string;
  isError: boolean;
}

/** Throttle: max N drops per second to avoid flooding from burst ingests */
const DROP_MIN_INTERVAL_MS = 300; // ~3 drops/sec max

interface VisualizerProps {
  flights: ProcessedFlight[];
  flightAnalyzer: Tone.Analyser | null;
  myLat: number;
  myLon: number;
  wikiAnalyzer: Tone.Analyser | null;
  engine: AudioEngine | null;
}

const DISTANCE_CIRCLES = [1, 5, 10];
const GEO_SCALE = 3;
const VIZ_COLORS = {
  weather: STREAM_COLORS.weather,
  flights: STREAM_COLORS.flights,
  wiki: STREAM_COLORS.wikipedia,
  archive: STREAM_COLORS.archive,
};

// Archive blob palette — color per mediatype zone
const ARCHIVE_PALETTE = ['#fcb315', '#96874d', '#709390', '#704357'] as const;
// Mediatype → zone center (normalised 0-1) + color index
// Spread across the canvas like nebulae — each type clusters in its own region
const MEDIATYPE_ZONES: Record<string, { cx: number; cy: number; colorIdx: number }> = {
  texts:      { cx: 0.18, cy: 0.22, colorIdx: 0 }, // gold — upper left
  audio:      { cx: 0.82, cy: 0.20, colorIdx: 1 }, // olive — upper right
  movies:     { cx: 0.15, cy: 0.75, colorIdx: 2 }, // teal — lower left
  software:   { cx: 0.80, cy: 0.78, colorIdx: 3 }, // plum — lower right
  web:        { cx: 0.50, cy: 0.15, colorIdx: 1 }, // olive — top center
  image:      { cx: 0.50, cy: 0.85, colorIdx: 0 }, // gold — bottom center
  data:       { cx: 0.28, cy: 0.50, colorIdx: 2 }, // teal — mid left
  collection: { cx: 0.72, cy: 0.50, colorIdx: 3 }, // plum — mid right
};
// Unknown mediatypes get distributed randomly using their identifier hash
const MEDIATYPE_DEFAULT_ZONE = { cx: 0.50, cy: 0.50, colorIdx: 1 };

function hash32(input: string, seed = 0x811c9dc5): number {
  // FNV-1a 32-bit hash for stable deterministic placement.
  let h = seed;
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
  flights,
  flightAnalyzer,
  myLat,
  myLon,
  wikiAnalyzer,
  engine,
}: VisualizerProps) => {
  const [infoPanel, setInfoPanel] = useState<{
    title: string;
    json: string;
    url?: string;
    media?: Array<{ label: string; href: string; playable?: boolean }>;
  } | null>(null);
  const activeStreams = useStore((s) => s.activeStreams);
  const channels = useStore((s) => s.channels);

  // Check if any enabled+unmuted stream is still connecting
  const isPlaying = useStore((s) => s.isPlaying);
  const enabledIds = Object.entries(channels)
    .filter(([id, ch]) => ch.enabled && !ch.mute && !ch.parentPluginId && !id.startsWith('otlp'))
    .map(([id]) => id);
  // Show loading blur only until the first stream connects (not while stragglers catch up)
  const anyConnected = enabledIds.some((id) => activeStreams[id]?.status === 'connected');
  const anyLoading = isPlaying && enabledIds.length > 0 && !anyConnected;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editsRef = useRef<WikiEdit[]>([]);
  const archiveBlobsRef = useRef<ArchiveBlob[]>([]);
  const dropsRef = useRef<IngestDrop[]>([]);
  const lastDropMsRef = useRef<number>(0);
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
      const hx = hash32(title, 0x811c9dc5);
      const hy = hash32(title, 0x6c62272e);
      // Store normalised 0-1 coords — converted to pixels at draw time
      const nx = (hx >>> 0) / 0xffffffff;
      const ny = (hy >>> 0) / 0xffffffff;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

      editsRef.current = [{
        title,
        url,
        size: editSize,
        age: 0,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        nx,
        ny,
      }, ...editsRef.current].slice(0, 50);
    }, 'wikipedia');

    return () => { engine.offData('viz-wiki'); };
  }, [engine]);

  // Listen for Internet Archive changes
  useEffect(() => {
    if (!engine) return;

    engine.onData('viz-archive', (dp: DataPoint) => {
      const f = dp.fields;
      const title = String(f.title ?? f.identifier ?? '');
      const mediatype = String(f.mediatype ?? 'unknown');
      const blobSize = 40;
      // Position within the mediatype's zone — jitter from zone center
      const zone = MEDIATYPE_ZONES[mediatype] ?? MEDIATYPE_DEFAULT_ZONE;
      const isUnknown = !MEDIATYPE_ZONES[mediatype];
      const hx = hash32(title, 0x9e3779b9);
      const hy = hash32(title, 0x517cc1b7);
      // Unknown items spread wide across canvas; known items cluster in their zone
      const spread = isUnknown ? 0.7 : 0.25;
      const jitterX = ((hx >>> 0) / 0xffffffff - 0.5) * spread;
      const jitterY = ((hy >>> 0) / 0xffffffff - 0.5) * spread;
      const nx = Math.max(0.05, Math.min(0.95, zone.cx + jitterX));
      const ny = Math.max(0.05, Math.min(0.95, zone.cy + jitterY));

      const identifier = String(f.identifier ?? title);
      archiveBlobsRef.current = [{
        identifier,
        title,
        mediatype,
        downloads: Number(f.downloads ?? 0),
        size: blobSize,
        age: 0,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        nx,
        ny,
      }, ...archiveBlobsRef.current].slice(0, 50);
    }, 'archive');

    return () => { engine.offData('viz-archive'); };
  }, [engine]);

  // Keep a ref to channels so the ingest listener can read visualEnabled
  // without re-registering on every channel change.
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // Listen for personal ingest events → throttled falling rain drops
  useEffect(() => {
    if (!engine) return;

    engine.onData('viz-ingest', (dp: DataPoint) => {
      const streamId = dp.streamId;
      if (!streamId.startsWith('otlp:') && !streamId.startsWith('dd:') && !streamId.startsWith('github:') && !streamId.startsWith('notify:')) return;

      // Respect source-level visual toggle
      const ch = channelsRef.current[streamId];
      if (ch?.visualEnabled === false) return;

      // Throttle: skip if we created a drop too recently
      const now = performance.now();
      if (now - lastDropMsRef.current < DROP_MIN_INTERVAL_MS) return;
      lastDropMsRef.current = now;

      // Don't create if we already have plenty falling
      if (dropsRef.current.length >= 60) return;

      const color = getStreamColor(streamId);
      const isError = dp.fields.isError === true || dp.fields.isError === 1 || dp.fields.statusCode === 2;

      dropsRef.current.push({
        x: 0.05 + Math.random() * 0.9,
        y: -0.02 - Math.random() * 0.03, // start just above viewport
        speed: 0.004 + Math.random() * 0.003, // ~6s to cross screen
        color: isError ? '#ef4444' : color,
        size: isError ? 5 : 3 + Math.random() * 1.5,
        opacity: 0.8,
        label: String(dp.fields.spanName ?? dp.fields.serviceName ?? streamId.split(':')[1] ?? ''),
        isError,
      });
    }, '*');

    return () => { engine.offData('viz-ingest'); };
  }, [engine]);

  // Age wiki edits + advance ingest drops on a fixed interval
  useEffect(() => {
    const interval = setInterval(() => {
      editsRef.current = editsRef.current
        .map((e) => ({ ...e, age: e.age + 0.1 }))
        .filter((e) => e.age < 30);

      archiveBlobsRef.current = archiveBlobsRef.current
        .map((b) => ({ ...b, age: b.age + 0.01 }))
        .filter((b) => b.age < 10);

      if (dropsRef.current.length > 0) {
        dropsRef.current = dropsRef.current
          .map((d) => ({
            ...d,
            y: d.y + d.speed,
            opacity: d.opacity - 0.0012, // fade slowly — outlasts the full fall
          }))
          .filter((d) => d.y < 1.2 && d.opacity > 0.02);
      }
    }, 30);
    return () => clearInterval(interval);
  }, []);

  // Canvas resize — fill container. Uses ResizeObserver so the canvas
  // re-sizes when the tab switches from display:none → block.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return; // still hidden
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
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

    // Clear to transparent so CSS atmosphere shows through
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h);
    const latScale = scale * GEO_SCALE;
    const lonScale = scale * GEO_SCALE;

    // "Black hole sun" — dark disc with warm glowing rim
    const scopeRadius = Math.max(latScale, lonScale) * (DISTANCE_CIRCLES[DISTANCE_CIRCLES.length - 1] / 69) + 60;

    // Outer glow ring (warm rose halo)
    const glowGrad = ctx.createRadialGradient(cx, cy, scopeRadius * 0.85, cx, cy, scopeRadius * 1.15);
    glowGrad.addColorStop(0, 'rgba(124, 68, 79, 0)');
    glowGrad.addColorStop(0.4, 'rgba(124, 68, 79, 0.15)');
    glowGrad.addColorStop(0.7, 'rgba(124, 68, 79, 0.08)');
    glowGrad.addColorStop(1, 'rgba(124, 68, 79, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Dark disc body
    const discGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scopeRadius);
    discGrad.addColorStop(0, 'rgba(8, 8, 8, 0.95)');
    discGrad.addColorStop(0.6, 'rgba(10, 10, 10, 0.9)');
    discGrad.addColorStop(0.85, 'rgba(13, 13, 13, 0.8)');
    discGrad.addColorStop(1, 'rgba(13, 13, 13, 0)');
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, scopeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle rim stroke
    ctx.strokeStyle = 'rgba(124, 68, 79, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, scopeRadius * 0.95, 0, Math.PI * 2);
    ctx.stroke();

    // Distance circles
    ctx.strokeStyle = 'rgba(124, 68, 79, 0.3)';
    ctx.lineWidth = 1;
    for (const miles of DISTANCE_CIRCLES) {
      const rLat = (miles / 69) * latScale;
      const rLon = (miles / 69) * lonScale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rLon, rLat, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // User dot with strong glow
    ctx.fillStyle = '#7C444F';
    ctx.shadowColor = 'rgba(124, 68, 79, 0.8)';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fill(); // double fill for stronger glow
    ctx.shadowBlur = 0;

    // Flights — interpolate positions between API polls
    const chSnap = channelsRef.current;
    const flightsVisual = chSnap['flights']?.visualEnabled !== false;
    const currentFlights = flightsVisual ? flightsRef.current : [];
    const airplane = airplaneImgRef.current;
    const nowMs = Date.now();
    for (const flight of currentFlights) {
      // Dead-reckoning: project forward using gspeed + track
      const elapsed = Math.min((nowMs - flight.lastSeen) / 1000, 30);
      // gspeed is knots (nautical miles/hr). 1 nm ≈ 1/60°. → deg/sec = gspeed / 216000
      const degPerSec = flight.gspeed / 216000;
      const trackRad = (flight.track * Math.PI) / 180;
      const dLat = degPerSec * Math.cos(trackRad) * elapsed;
      const dLon = degPerSec * Math.sin(trackRad) * elapsed / Math.cos((flight.lat * Math.PI) / 180);
      let interpLat = flight.lat + dLat;
      let interpLon = flight.lon + dLon;

      // Smooth blend from previous interpolated position over 1s to avoid jumps
      if (flight.prevLat != null && flight.prevLon != null && flight.prevTime != null) {
        const blendElapsed = (nowMs - flight.prevTime) / 1000;
        const BLEND_DURATION = 1.0;
        if (blendElapsed < BLEND_DURATION) {
          const t = blendElapsed / BLEND_DURATION;
          // Ease-out cubic
          const ease = 1 - (1 - t) * (1 - t) * (1 - t);
          interpLat = flight.prevLat + (interpLat - flight.prevLat) * ease;
          interpLon = flight.prevLon + (interpLon - flight.prevLon) * ease;
        }
      }

      const latDiff = interpLat - myLat;
      const lonDiff = interpLon - myLon;
      const x = cx + lonDiff * lonScale;
      const y = cy - latDiff * latScale;
      const size = lerp(Math.min(flight.distance, 10), 0, 10, 36, 16);
      const margin = 100;

      if (x < -margin || x > w + margin || y < -margin || y > h + margin) continue;

      ctx.save();
      ctx.translate(x, y);

      // Rotate airplane by track (offset -90° because SVG points up/north, canvas 0° is east)
      const drawRad = ((flight.track - 90) * Math.PI) / 180;
      ctx.rotate(drawRad);

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

    // Wiki edits — compute pixel position from normalised coords each frame
    const wikiVisual = chSnap['wikipedia']?.visualEnabled !== false;
    if (!wikiVisual) { /* skip wiki rendering */ }
    for (const edit of (wikiVisual ? editsRef.current : [])) {
      const margin = 50;
      const x = margin + edit.nx * (w - margin * 2);
      const y = margin + edit.ny * (h - margin * 2);
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

      ctx.fillStyle = VIZ_COLORS.wiki;
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

    // Internet Archive blobs — radial gradient circles that fade out
    const archiveVisual = chSnap['archive']?.visualEnabled !== false;
    for (const blob of (archiveVisual ? archiveBlobsRef.current : [])) {
      const margin = 50;
      const x = margin + blob.nx * (w - margin * 2);
      const y = margin + blob.ny * (h - margin * 2);
      const maxSize = blob.size;
      const currentSize = maxSize * (1 - blob.age / 10);
      if (currentSize <= 0) continue;
      const fadeAlpha = Math.max(0, 1 - blob.age / 8);

      const zone = MEDIATYPE_ZONES[blob.mediatype] ?? MEDIATYPE_DEFAULT_ZONE;
      const color = ARCHIVE_PALETTE[zone.colorIdx];
      const r = currentSize / 2;

      // Radial gradient: solid center → transparent edge
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35 * fadeAlpha;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // IA "eye" dot
      ctx.fillStyle = `rgba(139, 157, 175, ${0.6 * fadeAlpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Title label for larger blobs
      if (blob.size > 20 && blob.age < 5) {
        const displayTitle = blob.title.length > 30
          ? blob.title.substring(0, 27) + '...'
          : blob.title;
        ctx.fillStyle = `rgba(139, 157, 175, ${0.5 * fadeAlpha})`;
        ctx.font = '11px var(--font-geist-sans, sans-serif)';
        ctx.textAlign = 'center';
        ctx.fillText(displayTitle, x, y + r + 14);
        ctx.fillStyle = `rgba(139, 157, 175, ${0.3 * fadeAlpha})`;
        ctx.font = '9px var(--font-geist-sans, sans-serif)';
        ctx.fillText(blob.mediatype, x, y + r + 26);
      }
    }

    // Ingest rain — drifting labels
    for (const drop of dropsRef.current) {
      const dx = drop.x * w;
      const dy = drop.y * h;
      if (dy < -20 || dy > h + 20 || !drop.label) continue;

      ctx.globalAlpha = drop.opacity;
      ctx.fillStyle = drop.color;
      ctx.font = `${drop.isError ? 'bold ' : ''}9px var(--font-geist-mono, monospace)`;
      ctx.textAlign = 'center';
      ctx.fillText(drop.label.slice(0, 24), dx, dy);
      ctx.globalAlpha = 1;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [myLat, myLon, flightAnalyzer, wikiAnalyzer, engine]);

  // Animation loop — do NOT reset lastFrameMsRef so drop timing stays continuous
  useEffect(() => {
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

    const nowMs = Date.now();
    for (const flight of flightsRef.current) {
      if (!flight.callsign) continue;
      // Dead-reckoning must match draw loop
      const elapsed = Math.min((nowMs - flight.lastSeen) / 1000, 30);
      const degPerSec = flight.gspeed / 216000;
      const trackRad = (flight.track * Math.PI) / 180;
      const dLat = degPerSec * Math.cos(trackRad) * elapsed;
      const dLon = degPerSec * Math.sin(trackRad) * elapsed / Math.cos((flight.lat * Math.PI) / 180);
      let hitLat = flight.lat + dLat;
      let hitLon = flight.lon + dLon;
      if (flight.prevLat != null && flight.prevLon != null && flight.prevTime != null) {
        const blendElapsed = (nowMs - flight.prevTime) / 1000;
        if (blendElapsed < 1.0) {
          const t = blendElapsed;
          const ease = 1 - (1 - t) * (1 - t) * (1 - t);
          hitLat = flight.prevLat + (hitLat - flight.prevLat) * ease;
          hitLon = flight.prevLon + (hitLon - flight.prevLon) * ease;
        }
      }
      const latDiff = hitLat - myLat;
      const lonDiff = hitLon - myLon;
      const x = cx + lonDiff * lonScale;
      const y = cy - latDiff * latScale;
      const size = lerp(Math.min(flight.distance, 10), 0, 10, 36, 16);
      const dx = mx - x;
      const dy = my - y;
      if (Math.sqrt(dx * dx + dy * dy) < size / 2) {
        const apiUrl = `https://api.adsbdb.com/v0/callsign/${flight.callsign}`;
        setInfoPanel({ title: flight.callsign, json: 'Loading...', url: apiUrl });
        fetch(apiUrl)
          .then((r) => r.json())
          .then((data) => setInfoPanel({ title: flight.callsign!, json: JSON.stringify(data, null, 2), url: apiUrl }))
          .catch(() => setInfoPanel({ title: flight.callsign!, json: '{ "error": "Failed to fetch" }', url: apiUrl }));
        return;
      }
    }

    for (const edit of editsRef.current) {
      const editMargin = 50;
      const ex = editMargin + edit.nx * (w - editMargin * 2);
      const ey = editMargin + edit.ny * (h - editMargin * 2);
      const dx = mx - ex;
      const dy = my - ey;
      if (Math.sqrt(dx * dx + dy * dy) < 20) {
        const encoded = encodeURIComponent(edit.title.replace(/ /g, '_'));
        const diffUrl = `https://en.wikipedia.org/w/index.php?title=${encoded}&action=history`;
        const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
        setInfoPanel({ title: edit.title, json: 'Loading...', url: diffUrl });
        fetch(apiUrl)
          .then((r) => r.json())
          .then((data) => setInfoPanel({
            title: edit.title,
            json: JSON.stringify({ extract: data.extract, description: data.description, lastEdited: data.timestamp }, null, 2),
            url: diffUrl,
          }))
          .catch(() => setInfoPanel({ title: edit.title, json: '{ "error": "Failed to fetch" }', url: diffUrl }));
        return;
      }
    }

    for (const blob of archiveBlobsRef.current) {
      const blobMargin = 50;
      const bx = blobMargin + blob.nx * (w - blobMargin * 2);
      const by = blobMargin + blob.ny * (h - blobMargin * 2);
      const dx = mx - bx;
      const dy = my - by;
      if (Math.sqrt(dx * dx + dy * dy) < Math.max(blob.size / 2, 15)) {
        const iaUrl = `https://archive.org/details/${encodeURIComponent(blob.identifier)}`;
        const metaUrl = `https://archive.org/metadata/${encodeURIComponent(blob.identifier)}`;
        const viewsUrl = `https://be-api.us.archive.org/views/v1/short/${encodeURIComponent(blob.identifier)}`;
        // Show what we know immediately, fetch more details in background
        const quick = JSON.stringify({
          mediatype: blob.mediatype,
          identifier: blob.identifier,
          downloads: blob.downloads,
        }, null, 2);
        setInfoPanel({ title: `☞ ${blob.title}`, json: `Internet Archive · ${blob.mediatype}\n\n${quick}\n\nFetching details...`, url: iaUrl });
        Promise.allSettled([
          fetch(metaUrl, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
          fetch(viewsUrl, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
        ])
          .then(([metaRes, viewsRes]) => {
            if (metaRes.status === 'rejected') {
              setInfoPanel({ title: `☞ ${blob.title}`, json: `Internet Archive · ${blob.mediatype}\n\nCould not fetch details.`, url: iaUrl });
              return;
            }
            const meta = metaRes.value.metadata ?? {};
            const views = viewsRes.status === 'fulfilled'
              ? viewsRes.value?.[blob.identifier]
              : undefined;
            // Direct links to playable derivative files (MP3 audio, MP4 video)
            const files: Array<{ name: string; format?: string; length?: string }> =
              metaRes.value.files ?? [];
            const media = files
              .filter((fl) => /MP3$|MPEG4$|h\.264/i.test(fl.format ?? ''))
              .slice(0, 3)
              .map((fl) => ({
                label: `${fl.name}${fl.length ? ` · ${fl.length}` : ''}`,
                href: `https://archive.org/download/${encodeURIComponent(blob.identifier)}/${encodeURIComponent(fl.name)}`,
                playable: /MP3$/i.test(fl.format ?? ''),
              }));
            const desc = typeof meta.description === 'string'
              ? meta.description.slice(0, 300)
              : Array.isArray(meta.description) ? meta.description[0]?.slice(0, 300) : undefined;
            const details = [
              `Internet Archive · ${meta.mediatype ?? blob.mediatype}`,
              '',
              meta.creator ? `Creator: ${meta.creator}` : null,
              meta.date ? `Date: ${meta.date}` : null,
              meta.collection ? `Collection: ${Array.isArray(meta.collection) ? meta.collection.join(', ') : meta.collection}` : null,
              `Downloads: ${blob.downloads.toLocaleString()}`,
              views?.have_data
                ? `Views: ${views.all_time.toLocaleString()} all-time · ${views.last_30day.toLocaleString()} last 30 days`
                : null,
              desc ? `\n${desc}` : null,
            ].filter(Boolean).join('\n');
            setInfoPanel({
              title: `☞ ${meta.title ?? blob.title}`,
              json: details,
              url: iaUrl,
              media,
            });
          });
        return;
      }
    }
  }, [myLat, myLon]);

  return (
    <div ref={containerRef} className={`w-full h-full relative ${isPlaying ? (anyLoading ? 'viz-loading' : 'viz-loaded') : ''}`}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ cursor: 'pointer', display: 'block' }}
      />
      <div className="viz-loading-glow" />
      {infoPanel && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 20,
          }}
          onClick={() => setInfoPanel(null)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 12,
              padding: '16px 20px',
              maxWidth: '90%',
              maxHeight: '70%',
              overflow: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 16, fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '0.04em',
              }}>
                {infoPanel.url ? (
                  <a
                    href={infoPanel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--text-muted)', textUnderlineOffset: 3 }}
                  >
                    {infoPanel.title}
                  </a>
                ) : infoPanel.title}
              </span>
              <button
                onClick={() => setInfoPanel(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: 18, cursor: 'pointer', padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
            <pre style={{
              fontFamily: 'var(--font-geist-mono, monospace)',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}>
              {infoPanel.json}
            </pre>
            {infoPanel.media && infoPanel.media.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {infoPanel.media.map((m) => (
                  <div key={m.href} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.playable && (
                      <button
                        onClick={() => archivePlayer.play(m.href, infoPanel.title.replace(/^☞ /, ''))}
                        aria-label={`Play ${m.label}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--accent, var(--text-primary))', fontSize: 13, padding: 0, lineHeight: 1,
                        }}
                      >
                        ▶
                      </button>
                    )}
                    <a
                      href={m.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--font-geist-mono, monospace)',
                        fontSize: 11,
                        color: 'var(--accent, var(--text-primary))',
                        textDecoration: 'none',
                        wordBreak: 'break-all',
                      }}
                    >
                      {m.label} ↗
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Visualizer;
