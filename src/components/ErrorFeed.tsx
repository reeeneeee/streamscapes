"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStreamColor } from '@/lib/stream-constants';
import type { AudioEngine } from '@/lib/audio-engine';
import type { DataPoint } from '@/types/stream';

interface ErrorEntry {
  id: number;
  timestamp: number;
  serviceName: string;
  spanName: string;
  errorMessage?: string;
  httpStatusCode?: number;
  streamId: string;
}

const MAX_ERRORS = 50;
let nextId = 0;

function sourceLabel(streamId: string): string {
  if (streamId.startsWith('otlp:')) return 'OTLP';
  if (streamId.startsWith('dd:')) return 'Datadog';
  if (streamId.startsWith('github:')) return 'GitHub';
  if (streamId.startsWith('notify:')) return 'Webhook';
  return 'Trace';
}

export default function ErrorFeed({ engine }: { engine: AudioEngine | null }) {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to all data points and capture errors
  useEffect(() => {
    if (!engine) return;

    const handler = (dp: DataPoint) => {
      if (!dp.fields.isError) return;
      if (dp.fields.replay) return; // Don't toast replayed spans
      if (!dp.streamId.includes(':')) return; // Only show errors from ingest sources

      const entry: ErrorEntry = {
        id: nextId++,
        timestamp: Date.now(),
        serviceName: dp.streamId.slice(dp.streamId.indexOf(':') + 1),
        spanName: String(dp.fields.spanName ?? 'unknown'),
        errorMessage: dp.fields.errorMessage ? String(dp.fields.errorMessage) : undefined,
        httpStatusCode: dp.fields.httpStatusCode ? Number(dp.fields.httpStatusCode) : undefined,
        streamId: dp.streamId,
      };

      setErrors((prev) => {
        const next = [entry, ...prev];
        if (next.length > MAX_ERRORS) next.length = MAX_ERRORS;
        return next;
      });
    };

    engine.onData('error-feed', handler, '*');
    return () => { engine.offData('error-feed'); };
  }, [engine]);

  const dismissAll = useCallback(() => {
    setErrors([]);
    setExpanded(false);
  }, []);

  const dismiss = useCallback((id: number) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  if (errors.length === 0) return null;

  // Collapsed: show a small badge
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          bottom: 'calc(var(--transport-height, 44px) + 12px)',
          right: 16,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'rgba(239, 68, 68, 0.9)',
          fontFamily: 'var(--font-display, var(--ff-display))',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
        {errors.length} span error{errors.length !== 1 ? 's' : ''}
      </button>
    );
  }

  // Expanded: scrollable list
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--transport-height, 44px) + 12px)',
        right: 16,
        zIndex: 100,
        width: 380,
        maxHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'rgba(20, 18, 16, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(239, 68, 68, 0.8)',
          }}
        >
          Span Errors ({errors.length})
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={dismissAll}
            style={{
              fontFamily: 'var(--font-display, var(--ff-display))',
              fontSize: 11,
              color: 'rgba(245, 240, 235, 0.35)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Dismiss all
          </button>
          <button
            onClick={() => setExpanded(false)}
            style={{
              fontFamily: 'var(--font-display, var(--ff-display))',
              fontSize: 13,
              color: 'rgba(245, 240, 235, 0.35)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Scrollable list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {errors.map((err) => {
          const color = getStreamColor(err.streamId);
          const time = new Date(err.timestamp);
          const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;

          return (
            <div
              key={err.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 14px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display, var(--ff-display))',
                  fontSize: 10,
                  color: 'rgba(245, 240, 235, 0.2)',
                  flexShrink: 0,
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {timeStr}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display, var(--ff-display))',
                  fontSize: 9,
                  fontWeight: 500,
                  color: 'rgba(245, 240, 235, 0.3)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 3,
                  padding: '2px 5px',
                  flexShrink: 0,
                  marginTop: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {sourceLabel(err.streamId)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body, var(--ff-body))',
                  fontSize: 11,
                  fontWeight: 500,
                  color,
                  flexShrink: 0,
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 1,
                }}
              >
                {err.serviceName}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body, var(--ff-body))',
                  fontSize: 11,
                  color: 'rgba(245, 240, 235, 0.5)',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 1,
                }}
                title={err.errorMessage || err.spanName}
              >
                {err.spanName}
                {err.httpStatusCode ? ` (${err.httpStatusCode})` : ''}
              </span>
              <button
                onClick={() => dismiss(err.id)}
                style={{
                  fontFamily: 'var(--font-display, var(--ff-display))',
                  fontSize: 12,
                  color: 'rgba(245, 240, 235, 0.15)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
