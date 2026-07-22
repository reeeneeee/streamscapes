export interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number; // knots — dead-reckoning formulas depend on this unit
  distance: number;
  frequency: number;
  callsign?: string;
  track: number; // heading in degrees from north, clockwise
  lastSeen: number; // Date.now() timestamp
  // Previous position for smooth blending on API updates
  prevLat?: number;
  prevLon?: number;
  prevTime?: number; // timestamp of previous update
}
