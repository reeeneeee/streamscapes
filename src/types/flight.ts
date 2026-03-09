export interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  distance: number;
  frequency: number;
  callsign?: string;
  track: number; // heading in degrees from north, clockwise
  lastSeen: number; // Date.now() timestamp
}
