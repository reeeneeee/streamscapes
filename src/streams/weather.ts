import type { StreamPlugin, DataPoint } from '@/types/stream';

export function createWeatherPlugin(lat: number, lon: number): StreamPlugin {
  return {
    id: 'weather',
    name: 'Local Weather',
    description: 'Current weather conditions at your location',
    category: 'environment',

    async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
      while (!signal.aborted) {
        try {
          const response = await fetch(`/api/streams/weather?lat=${lat}&lon=${lon}`, { signal });
          if (response.ok) {
            const data = await response.json();

            // Normalize across API versions (2.5 vs 3.0)
            const feelsLike = data.current?.feels_like ?? data.main?.feels_like ?? 60;
            const clouds = data.current?.clouds ?? data.clouds?.all ?? 0;
            const humidity = data.current?.humidity ?? data.main?.humidity ?? 50;
            const windSpeed = data.current?.wind_speed ?? data.wind?.speed ?? 0;
            const temp = data.current?.temp ?? data.main?.temp ?? 60;

            yield {
              streamId: 'weather',
              timestamp: Date.now(),
              fields: {
                temperature: temp,
                feelsLike,
                clouds,
                humidity,
                windSpeed,
              },
            };
          }
        } catch (error) {
          if (signal.aborted) return;
          console.error('Weather fetch error:', error);
        }

        // Weather doesn't change fast — poll every 3 minutes
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 3 * 60_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    },
  };
}
