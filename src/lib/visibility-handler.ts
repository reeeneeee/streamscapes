import * as Tone from 'tone';

/** Suspend AudioContext when tab is hidden, resume when visible */
export function setupVisibilityHandler(): () => void {
  const handler = () => {
    const ctx = Tone.getContext().rawContext as AudioContext | undefined;
    if (document.hidden) {
      ctx?.suspend();
    } else {
      ctx?.resume();
    }
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
