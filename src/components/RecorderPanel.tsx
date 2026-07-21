'use client';

import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import type { AudioEngine } from '@/lib/audio-engine';

interface Take {
  url: string;
  name: string;
  at: string;
}

/**
 * Record tab — capture the live soundscape, optionally layered with the
 * microphone (field recordings, spoken word), into downloadable takes.
 * The mic is recorded but never monitored back through the speakers.
 */
export default function RecorderPanel({ engine }: { engine: AudioEngine | null }) {
  const recorderRef = useRef<Tone.Recorder | null>(null);
  const micRef = useRef<Tone.UserMedia | null>(null);
  const [recording, setRecording] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Stop cleanly if the component unmounts mid-recording
  useEffect(() => () => {
    micRef.current?.close();
    micRef.current?.dispose();
    recorderRef.current?.dispose();
  }, []);

  const start = async () => {
    setMicNote(null);
    const rec = new Tone.Recorder();
    recorderRef.current = rec;
    Tone.getDestination().connect(rec);
    if (micEnabled) {
      try {
        const mic = new Tone.UserMedia();
        await mic.open();
        mic.connect(rec);
        micRef.current = mic;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setMicNote('Microphone blocked — click the icon by the address bar → Site settings → allow Microphone, then reload. Recording the soundscape only.');
        } else if (name === 'NotFoundError') {
          setMicNote('No microphone found — recording the soundscape only.');
        } else {
          setMicNote('Microphone unavailable — recording the soundscape only.');
        }
      }
    }
    setElapsed(0);
    rec.start();
    setRecording(true);
  };

  const stop = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    const blob = await rec.stop();
    try { Tone.getDestination().disconnect(rec); } catch { /* already torn down */ }
    micRef.current?.close();
    micRef.current?.dispose();
    micRef.current = null;
    rec.dispose();
    recorderRef.current = null;

    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const stamp = new Date();
    const name = `streamscapes-${stamp.toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
    setTakes((prev) => [
      { url: URL.createObjectURL(blob), name, at: stamp.toLocaleTimeString() },
      ...prev,
    ]);
  };

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!engine) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)', fontFamily: 'var(--font-body, var(--ff-body))', fontSize: 13 }}>
        Start the soundscape first — recording captures the live mix.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px', fontFamily: 'var(--font-body, var(--ff-body))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <button
          onClick={recording ? stop : start}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            border: '1px solid var(--border-strong)',
            background: recording ? 'var(--accent, #B04A5A)' : 'transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s',
          }}
        >
          <span style={{
            display: 'block',
            width: recording ? 20 : 24,
            height: recording ? 20 : 24,
            borderRadius: recording ? 4 : '50%',
            background: recording ? 'var(--bg-primary)' : 'var(--accent, #B04A5A)',
            transition: 'border-radius 0.2s',
          }} />
        </button>
        <div>
          <div style={{ fontFamily: 'var(--font-geist-mono, monospace)', fontSize: 24, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
            {mmss(elapsed)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {recording ? 'recording the soundscape' + (micRef.current ? ' + microphone' : '') : 'ready'}
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={micEnabled}
          disabled={recording}
          onChange={(e) => setMicEnabled(e.target.checked)}
        />
        include microphone (field recording / spoken word)
      </label>
      {micNote && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{micNote}</div>
      )}

      {takes.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 12,
          }}>
            Takes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {takes.map((t) => (
              <div key={t.url} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <audio controls src={t.url} style={{ flex: 1, height: 36 }} />
                <a
                  href={t.url}
                  download={t.name}
                  style={{ fontSize: 12, color: 'var(--accent, var(--text-primary))', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  ↓ {t.at}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
