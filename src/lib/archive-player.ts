import * as Tone from 'tone';

/**
 * Singleton player for Internet Archive media started from the visualizer
 * popup. Playback outlives the popup; the NowPlayingBar controls it from
 * anywhere in the app. When the Tone context is running, output is routed
 * through the master chain so it follows the master fader and is captured
 * by Record-tab takes.
 */

export interface NowPlaying {
  url: string;
  title: string;
  playing: boolean;
  volume: number;
}

const VOLUME_KEY = 'streamscapes.archivePlayerVolume';

class ArchivePlayer {
  private audio: HTMLAudioElement | null = null;
  private snapshot: NowPlaying | null = null;
  private listeners = new Set<() => void>();
  private volume = (() => {
    if (typeof localStorage === 'undefined') return 0.8;
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
  })();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): NowPlaying | null => this.snapshot;

  private emit(next: NowPlaying | null) {
    this.snapshot = next;
    for (const fn of this.listeners) fn();
  }

  play(url: string, title: string) {
    this.stop();
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    audio.volume = this.volume;
    this.audio = audio;

    try {
      const raw = Tone.getContext().rawContext as AudioContext;
      if (raw.state === 'running') {
        const src = raw.createMediaElementSource(audio);
        Tone.connect(src, Tone.getDestination());
      }
    } catch {
      // Fall back to the element's direct output
    }

    audio.onplay = () => { if (this.audio === audio) this.emit({ url, title, playing: true, volume: this.volume }); };
    audio.onpause = () => { if (this.audio === audio && !audio.ended) this.emit({ url, title, playing: false, volume: this.volume }); };
    audio.onended = () => { if (this.audio === audio) this.emit(null); };
    audio.onerror = () => { if (this.audio === audio) this.emit(null); };

    this.emit({ url, title, playing: true, volume: this.volume });
    audio.play().catch(() => { if (this.audio === audio) this.emit(null); });
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(VOLUME_KEY, String(this.volume)); } catch { /* private mode */ }
    if (this.audio) this.audio.volume = this.volume;
    if (this.snapshot) this.emit({ ...this.snapshot, volume: this.volume });
  }

  toggle() {
    const a = this.audio;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  stop() {
    const a = this.audio;
    if (a) {
      a.pause();
      a.removeAttribute('src');
    }
    this.audio = null;
    if (this.snapshot) this.emit(null);
  }
}

export const archivePlayer = new ArchivePlayer();
