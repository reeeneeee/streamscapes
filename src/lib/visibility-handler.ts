/** Resume AudioContext when tab becomes visible again (browser may suspend it).
 *  We never manually suspend — audio should keep playing across tabs.
 *  Tone.js is dynamically imported to avoid creating AudioContext on page load. */
export function setupVisibilityHandler(): () => void {
  const handler = async () => {
    if (!document.hidden) {
      try {
        const Tone = await import('tone');
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext | undefined;
        await ctx?.resume();
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
