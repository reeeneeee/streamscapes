export interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  distance: number;
  frequency: number;
  callsign?: string;
  vector?: {
    latPerSecond: number;
    lonPerSecond: number;
    lastUpdated: number;
  };
}
