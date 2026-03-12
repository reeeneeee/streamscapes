import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxies flight position data.
 * Query params: lamin, lamax, lomin, lomax (bounding box).
 *
 * Primary source: Airplanes.live (free, no key, community ADS-B network)
 * Fallback: OpenSky Network (free, but often times out from data centers)
 */

const FETCH_TIMEOUT_MS = 8_000;

interface FlightResult {
  icao24: string;
  callsign?: string;
  lat: number;
  lon: number;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  track: number | null;
  vertical_rate: number | null;
}

/* ---------- Airplanes.live (primary) ---------- */
async function fetchAirplanesLive(
  lamin: string, lamax: string, lomin: string, lomax: string,
): Promise<{ time: number; data: FlightResult[] }> {
  const centerLat = (parseFloat(lamin) + parseFloat(lamax)) / 2;
  const centerLon = (parseFloat(lomin) + parseFloat(lomax)) / 2;
  const url = `https://api.airplanes.live/v2/point/${centerLat.toFixed(4)}/${centerLon.toFixed(4)}/25`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Airplanes.live ${resp.status}`);
  const data = await resp.json();
  const ac: Record<string, unknown>[] = data?.ac ?? [];
  const flights: FlightResult[] = ac
    .filter((a) => a.lat != null && a.lon != null)
    .map((a) => ({
      icao24: String(a.hex ?? ''),
      callsign: a.flight ? String(a.flight).trim() : undefined,
      lat: Number(a.lat),
      lon: Number(a.lon),
      baro_altitude: a.alt_baro != null && a.alt_baro !== 'ground'
        ? Number(a.alt_baro) * 0.3048 : null, // feet → meters
      on_ground: a.alt_baro === 'ground',
      velocity: a.gs != null ? Number(a.gs) * 0.5144 : null, // knots → m/s
      track: a.track != null ? Number(a.track) : null,
      vertical_rate: a.baro_rate != null ? Number(a.baro_rate) * 0.00508 : null, // fpm → m/s
    }));
  return { time: Math.floor(Date.now() / 1000), data: flights };
}

/* ---------- OpenSky Network (fallback) ---------- */
async function fetchOpenSky(
  lamin: string, lamax: string, lomin: string, lomax: string,
): Promise<{ time: number; data: FlightResult[] }> {
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`OpenSky ${resp.status}`);
  const data = await resp.json();
  const states: unknown[][] = data?.states ?? [];
  const flights = states
    .filter((s) => s[5] != null && s[6] != null)
    .map((s) => ({
      icao24: s[0] as string,
      callsign: (s[1] as string)?.trim() || undefined,
      lat: s[6] as number,
      lon: s[5] as number,
      baro_altitude: s[7] as number | null,
      on_ground: s[8] as boolean,
      velocity: s[9] as number | null,
      track: s[10] as number | null,
      vertical_rate: s[11] as number | null,
    }));
  return { time: data?.time ?? Math.floor(Date.now() / 1000), data: flights };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lamin = searchParams.get('lamin');
  const lamax = searchParams.get('lamax');
  const lomin = searchParams.get('lomin');
  const lomax = searchParams.get('lomax');

  if (!lamin || !lamax || !lomin || !lomax) {
    return NextResponse.json({ error: 'lamin, lamax, lomin, lomax parameters required' }, { status: 400 });
  }

  const errors: string[] = [];

  try {
    const result = await fetchAirplanesLive(lamin, lamax, lomin, lomax);
    return NextResponse.json(result);
  } catch (err) {
    errors.push(`Airplanes.live: ${(err as Error).message}`);
  }

  try {
    const result = await fetchOpenSky(lamin, lamax, lomin, lomax);
    return NextResponse.json(result);
  } catch (err) {
    errors.push(`OpenSky: ${(err as Error).message}`);
  }

  return NextResponse.json(
    { error: 'All flight sources failed', details: errors },
    { status: 502 },
  );
}
