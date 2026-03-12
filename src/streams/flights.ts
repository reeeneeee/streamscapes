import type { StreamPlugin, DataPoint } from '@/types/stream';

interface FlightPosition {
  icao24: string;
  lat: number;
  lon: number;
  velocity: number | null; // m/s
  callsign?: string;
  baro_altitude: number | null; // meters
  track: number | null;
  on_ground: boolean;
}

/** Haversine-ish distance in miles using coordinate differences */
function coordDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2)) * 69;
}

export function createFlightPlugin(lat: number, lon: number): StreamPlugin {
  return {
    id: 'flights',
    name: 'Nearby Flights',
    description: 'Live aircraft positions via OpenSky Network',
    category: 'environment',

    async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
      const lamin = (lat - 0.15).toFixed(4);
      const lamax = (lat + 0.15).toFixed(4);
      const lomin = (lon - 0.15).toFixed(4);
      const lomax = (lon + 0.15).toFixed(4);
      let consecutiveFailures = 0;

      while (!signal.aborted) {
        try {
          const response = await fetch(
            `/api/streams/flights?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`,
            { signal, cache: 'no-store' },
          );
          if (response.ok) {
            const json = await response.json();
            const flights: FlightPosition[] = json.data ?? [];
            consecutiveFailures = 0;

            for (const flight of flights) {
              if (flight.on_ground) continue; // skip grounded aircraft

              const distance = coordDistanceMiles(lat, lon, flight.lat, flight.lon);
              const speedMph = (flight.velocity ?? 0) * 2.237; // m/s to mph
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
                  flightId: flight.icao24,
                  lat: flight.lat,
                  lon: flight.lon,
                  distance,
                  speed: speedMph,
                  altitude: flight.baro_altitude ?? 0,
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

        // Airplanes.live has no rate limit — poll every 15s for smooth interpolation
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 15_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    },
  };
}
