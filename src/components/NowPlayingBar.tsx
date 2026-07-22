'use client';

import { useSyncExternalStore } from 'react';
import { archivePlayer } from '@/lib/archive-player';

/** Bottom-center pill controlling Internet Archive playback started from the
 *  visualizer popup. Renders nothing when idle. */
export default function NowPlayingBar() {
  const now = useSyncExternalStore(archivePlayer.subscribe, archivePlayer.getSnapshot, () => null);
  if (!now) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-strong)',
        borderRadius: 999,
        padding: '8px 16px',
        maxWidth: '72vw',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <button
        onClick={() => archivePlayer.toggle()}
        aria-label={now.playing ? 'Pause' : 'Play'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 15, padding: 0, lineHeight: 1 }}
      >
        {now.playing ? '⏸' : '▶'}
      </button>
      <div className="now-playing-marquee">
        <div
          className="marquee-track"
          style={{
            fontFamily: 'var(--font-body, var(--ff-body))',
            fontSize: 12, color: 'var(--text-secondary)',
            animationDuration: `${Math.max(8, now.title.length * 0.4)}s`,
            animationPlayState: now.playing ? 'running' : 'paused',
          }}
        >
          <span>{now.title}</span>
          <span aria-hidden="true">{now.title}</span>
        </div>
      </div>
      <button
        onClick={() => archivePlayer.stop()}
        aria-label="Stop playback"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: 0, lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}
