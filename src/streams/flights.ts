import type { StreamPlugin, DataPoint } from '@/types/stream';

interface FlightPosition {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  callsign?: string;
  alt?: number;
  track?: number;
}

/** Haversine-ish distance in miles using coordinate differences */
function coordDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2)) * 69;
}

export function createFlightPlugin(lat: number, lon: number): StreamPlugin {
  return {
    id: 'flights',
    name: 'Nearby Flights',
    description: 'Live aircraft positions near your location',
    category: 'environment',

    async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
      const bounds = `${lat + 0.15},${lat - 0.15},${lon - 0.15},${lon + 0.15}`;
      let consecutiveFailures = 0;

      while (!signal.aborted) {
        try {
          const response = await fetch(`/api/streams/flights?bounds=${bounds}`, {
            signal,
            cache: 'no-store',
          });
          if (response.ok) {
            const data = await response.json();
            const flights: FlightPosition[] = data.data ?? [];
            consecutiveFailures = 0;

            for (const flight of flights) {
              const distance = coordDistanceMiles(lat, lon, flight.lat, flight.lon);
              const maxDist = 10.0;
              const minFreq = 110;
              const maxFreq = 880;
              const frequency = minFreq * Math.pow(
                maxFreq / minFreq,
                Math.max(0, maxDist - distance) / maxDist
              );

              yield {
                streamId: 'flights',
                timestamp: Date.now(),
                fields: {
                  flightId: flight.fr24_id,
                  lat: flight.lat,
                  lon: flight.lon,
                  distance,
                  speed: flight.gspeed * 1.15, // knots to mph
                  altitude: flight.alt ?? 0,
                  frequency,
                  callsign: flight.callsign ?? '',
                  track: flight.track ?? 0,
                },
              };
            }
          } else {
            consecutiveFailures += 1;
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof DOMException && error.name === 'AbortError') return;
          consecutiveFailures += 1;
          if (consecutiveFailures === 1 || consecutiveFailures % 10 === 0) {
            console.warn(`Flights stream fetch failed (x${consecutiveFailures}). Retrying...`);
          }
        }

        // Wait before next fetch (30s — interpolation fills the gap)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 30_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    },
  };
}
