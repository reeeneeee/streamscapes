import * as Tone from 'tone';

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

/** Suspend AudioContext when tab is hidden, resume when visible.
 *  On iOS, skip suspend — the browser/native app manages audio lifecycle. */
export function setupVisibilityHandler(): () => void {
  const handler = async () => {
    if (document.hidden) {
      if (!isIOS) {
        const ctx = Tone.getContext().rawContext as AudioContext | undefined;
        ctx?.suspend();
      }
    } else {
      // Resume everything on return
      try {
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext | undefined;
        await ctx?.resume();
        // Restart transport if it was running
        const transport = Tone.getTransport();
        if (transport.state !== 'started') {
          transport.start();
        }
      } catch (e) {
        // ignore
      }
    }
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
