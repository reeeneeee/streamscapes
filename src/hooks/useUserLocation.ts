import { useState, useEffect } from 'react';

interface Location {
  lat: number;
  lon: number;
  error?: string;
}

const defaultLocation = {
  lat: 40.6711, // Default to Brooklyn coordinates
  lon: -73.9814
};

export function useUserLocation() {
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ ...defaultLocation, error: "Geolocation is not supported" });
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setLoading(false);
      },
      (error) => {
        console.warn("Error getting location:", error.message);
        setLocation({ ...defaultLocation, error: error.message });
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  }, []);

  return { location, loading };
} 