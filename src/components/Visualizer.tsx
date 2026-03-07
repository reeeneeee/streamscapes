"use client";

import { useEffect, useRef, useCallback } from "react";
import * as Tone from 'tone';

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
  backgroundColor?: string;
  scale: string[];
}

const DISTANCE_CIRCLES = [1, 5, 10]; // Miles
const GEO_SCALE = 3; // Multiplier for lat/lon → pixel conversion
const STREAM_COLORS = {
  weather: '#7C444F',
  flights: '#5C7285',
  wiki: '#4d6c81',
};

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
  backgroundColor,
}: VisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editsRef = useRef<WikiEdit[]>([]);
  const flightsRef = useRef<ProcessedFlight[]>(flights);
  const airplaneImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);

  flightsRef.current = flights;

  // Load airplane image
  useEffect(() => {
    const img = new Image();
    img.src = '/airplane.svg';
    img.onload = () => { airplaneImgRef.current = img; };
  }, []);

  // Listen for wiki edits
  useEffect(() => {
    const eventSource = new EventSource('/api/wiki-stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.server_name === "en.wikipedia.org" &&
          data.type === "edit" &&
          !data.title.includes(":")) {
          const editSize = data.length ? Math.abs(data.length.new - data.length.old) : 10;
          const seed = data.title.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          const w = containerRef.current?.clientWidth || 400;
          const x = (seed % 1000) / 1000 * (w - 100) + 50;
          const y = ((seed % 500) / 500) * (w - 100) + 50;

          editsRef.current = [{
            title: data.title,
            url: data.notify_url || "",
            size: Math.min(100, Math.max(10, editSize)),
            age: 0,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            position: { x, y },
          }, ...editsRef.current].slice(0, 50);
        }
      } catch { /* skip malformed */ }
    };

    return () => eventSource.close();
  }, []);

  // Age edits
  useEffect(() => {
    const interval = setInterval(() => {
      editsRef.current = editsRef.current
        .map((e) => ({ ...e, age: e.age + 0.1 }))
        .filter((e) => e.age < 30);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Canvas resize
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const w = container.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = w * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${w}px`;
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

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = backgroundColor || '#111';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const latScale = h * GEO_SCALE;
    const lonScale = w * GEO_SCALE;

    // Distance circles
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1.5;
    for (const miles of DISTANCE_CIRCLES) {
      const rLat = (miles / 69) * latScale;
      const rLon = (miles / 69) * lonScale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rLon, rLat, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // User dot
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
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

      // Rotation from vector
      if (flight.vector) {
        const { latPerSecond, lonPerSecond } = flight.vector;
        if (Math.abs(latPerSecond) > 0.00001 || Math.abs(lonPerSecond) > 0.00001) {
          const angle = Math.atan2(-latPerSecond, lonPerSecond) - Math.PI / 2;
          ctx.rotate(angle);

          // Direction line
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.78)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          const vs = 50;
          ctx.lineTo(lonPerSecond * vs, -latPerSecond * vs);
          ctx.stroke();
          ctx.rotate(-angle); // reset for image
          ctx.rotate(angle);
        }
      }

      // Draw airplane
      if (airplane && airplane.complete) {
        ctx.drawImage(airplane, -size / 2, -size / 2, size, size);
      }
      ctx.restore();

      // Distance label
      ctx.fillStyle = STREAM_COLORS.flights;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(flight.distance)} mi`, x, y - size / 2 - 10);
    }

    // Wiki edits
    for (const edit of editsRef.current) {
      const { x, y } = edit.position;
      const maxSize = edit.size;
      const currentSize = maxSize * (1 - edit.age / 60);

      // Ripple rings
      for (let i = 3; i >= 0; i--) {
        const rippleSize = currentSize * (1 + i * 0.3);
        const alpha = lerp(i, 0, 3, 0.78, 0.1);
        ctx.strokeStyle = `rgba(77, 108, 129, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rippleSize / 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Center dot
      ctx.fillStyle = STREAM_COLORS.wiki;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Title
      if (edit.size > 30 && edit.age < 20) {
        const displayTitle = edit.title.length > 25
          ? edit.title.substring(0, 22) + '...'
          : edit.title;
        ctx.fillStyle = STREAM_COLORS.flights;
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(displayTitle, x, y + currentSize);

        // Underline
        const tw = ctx.measureText(displayTitle).width;
        ctx.strokeStyle = STREAM_COLORS.flights;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - tw / 2, y + currentSize + 8);
        ctx.lineTo(x + tw / 2, y + currentSize + 8);
        ctx.stroke();
      }
    }

    // Waveforms
    const waveformY0 = h - 50;
    const waveformY1 = h - 10;
    const drawWaveform = (analyzer: Tone.Analyser, color: string) => {
      const data = analyzer.getValue() as Float32Array;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const px = lerp(i, 0, data.length, 0, w);
        const py = lerp(data[i], -1, 1, waveformY0, waveformY1);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    if (wikiAnalyzer) drawWaveform(wikiAnalyzer, STREAM_COLORS.wiki);
    if (flightAnalyzer) drawWaveform(flightAnalyzer, STREAM_COLORS.flights);
    if (weatherAnalyzer) drawWaveform(weatherAnalyzer, STREAM_COLORS.weather);

    rafRef.current = requestAnimationFrame(draw);
  }, [backgroundColor, myLat, myLon, weatherAnalyzer, flightAnalyzer, wikiAnalyzer]);

  // Animation loop
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
    const latScale = h * GEO_SCALE;
    const lonScale = w * GEO_SCALE;

    // Check flights
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

    // Check wiki edits
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
    <div className="w-full mb-4">
      <h4 className="mb-2 text-sm font-medium"></h4>
      <div ref={containerRef} className="w-full max-w-lg mx-auto rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          style={{ cursor: 'pointer', display: 'block' }}
        />
      </div>
    </div>
  );
};

export default Visualizer;
