"use client";

import { useEffect, useRef } from 'react';
import type * as Tone from 'tone';

const COLORS = {
  bg: '#1a1a1a',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#ef4444',
  dim: '#333',
};

export default function VUMeter({
  analyzer,
  width = 8,
  height = 120,
}: {
  analyzer: Tone.Analyser | null;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyzer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const values = analyzer.getValue() as Float32Array;

      // RMS level
      let sum = 0;
      for (let i = 0; i < values.length; i++) {
        sum += values[i] * values[i];
      }
      const rms = Math.sqrt(sum / values.length);

      // Convert to 0-1 range (roughly -60dB to 0dB)
      const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-10) + 60) / 60));

      // Draw
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      const segments = 20;
      const segHeight = (height - (segments - 1)) / segments;
      const activeSegments = Math.floor(level * segments);

      for (let i = 0; i < segments; i++) {
        const y = height - (i + 1) * (segHeight + 1);
        const ratio = i / segments;

        if (i < activeSegments) {
          if (ratio > 0.85) ctx.fillStyle = COLORS.red;
          else if (ratio > 0.7) ctx.fillStyle = COLORS.yellow;
          else ctx.fillStyle = COLORS.green;
        } else {
          ctx.fillStyle = COLORS.dim;
        }

        ctx.fillRect(0, y, width, segHeight);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [analyzer, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ borderRadius: 2 }}
    />
  );
}
