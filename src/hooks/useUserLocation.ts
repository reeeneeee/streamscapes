import { useState, useEffect, useCallback } from 'react';

interface Location {
  lat: number;
  lon: number;
  label?: string;
  isRandom?: boolean;
  error?: string;
}

const AIRPORTS = [
  { lat: 52.5600, lon: 13.2877, label: 'Berlin (BER)' },
  { lat: 51.4700, lon: -0.4543, label: 'London (LHR)' },
  { lat: 35.7647, lon: 140.3864, label: 'Tokyo (NRT)' },
  { lat: 37.6213, lon: -122.3790, label: 'San Francisco (SFO)' },
  { lat: 40.6413, lon: -73.7781, label: 'New York (JFK)' },
  { lat: 25.2532, lon: 55.3657, label: 'Dubai (DXB)' },
  { lat: -33.9461, lon: 151.1772, label: 'Sydney (SYD)' },
  { lat: 1.3644, lon: 103.9915, label: 'Singapore (SIN)' },
  { lat: 19.0896, lon: 72.8656, label: 'Mumbai (BOM)' },
  { lat: -23.4356, lon: -46.4731, label: 'S\u00E3o Paulo (GRU)' },
];

function pickRandomAirport(): Location {
  const airport = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
  return { ...airport, isRandom: true };
}

export function useUserLocation() {
  const [location, setLocation] = useState<Location>(() => pickRandomAirport());
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoading(false);
      setDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setLoading(false);
        setDenied(false);
      },
      () => {
        // Keep random airport fallback
        setLoading(false);
        setDenied(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  }, []);

  const dismissBanner = useCallback(() => setDenied(false), []);

  return { location, loading, denied, dismissBanner };
}
