"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale} from 'tonal';
import axios from "axios";

interface Flight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  callsign?: string;
}

interface ProcessedFlight extends Flight {
  distance: number;
  frequency: number;
}

export default function FlightSynth({ 
  volume, 
  onAnalyzerCreated,
  onFlightsUpdated 
}: { 
  volume: number,
  onAnalyzerCreated?: (analyzer: Tone.Analyser) => void,
  onFlightsUpdated?: (flights: ProcessedFlight[]) => void
}) {
  const [flightsInArea, setFlightsInArea] = useState<{data: Flight[]} | null>(null);
  const flightsDataRef = useRef<{data: Flight[]} | null>(null);
  const processedFlightsRef = useRef<Map<string, ProcessedFlight>>(new Map());
  const synthsRef = useRef<Map<string, any>>(new Map());
  const listenerRef = useRef<any>(null);
  const [processedFlights, setProcessedFlights] = useState<ProcessedFlight[]>([]);
  let currentFlightIds = new Set<string>();
  const analyzerRef = useRef<Tone.Analyser | null>(null);

  // TODO: make this based on user location, with permission
  const myLat = 40.6711;
  const myLon = -73.9814;
  const myBounds = `${myLat+0.07},${myLat-0.07},${myLon-0.07},${myLon+0.07}`;
  const flightradar24ApiKey = process.env.NEXT_PUBLIC_FLIGHTRADAR24_API_KEY;
  let config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `https://fr24api.flightradar24.com/api/live/flight-positions/light?bounds=${myBounds}`,
    headers: {
      'Accept': 'application/json',
      'Accept-Version': 'v1',
      'Authorization': `Bearer ${flightradar24ApiKey}`
    }
  };

  // Define these functions at component level
  const processFlight = (flight: Flight): ProcessedFlight => {
    let distance = Math.sqrt(
      Math.pow(flight.lat - myLat, 2) + 
      Math.pow(flight.lon - myLon, 2)
    )*69;
    const maxDist = 10.0;
    const minFreq = 110.0;
    const maxFreq = 880.0;
    let frequency = minFreq * Math.pow(maxFreq/minFreq, 
      Math.max(0, maxDist - Math.abs(distance)) / maxDist
    );
    
    return {
      ...flight,
      distance,
      frequency
    };
  };

  // Update volume for all synths when volume prop changes
  useEffect(() => {
    synthsRef.current.forEach(({ synth }) => {
      if (synth) {
        synth.volume.value = volume;
      }
    });
  }, [volume]);

  // Create analyzer in the initial useEffect
  useEffect(() => {
    // Create a master analyzer for all flight synths
    analyzerRef.current = new Tone.Analyser("waveform", 1024);
    
    // Notify parent component about the analyzer
    if (onAnalyzerCreated && analyzerRef.current) {
      onAnalyzerCreated(analyzerRef.current);
    }
    
    return () => {
      if (analyzerRef.current) {
        analyzerRef.current.dispose();
      }
    };
  }, [onAnalyzerCreated]);

  const updateSynths = () => {
    const currentFlights = flightsDataRef.current;
    if (!currentFlights || !currentFlights.data) return;
    
    // Process each flight and store in the ref
    currentFlights.data.forEach((flight) => {
      const flightId = flight.fr24_id;
      
      // If we already have this flight, update it
      if (processedFlightsRef.current.has(flightId)) {
        const existingFlight = processedFlightsRef.current.get(flightId)!;
        
        // Calculate speed in miles per second (for 1-second interval)
        const flightSpeed = flight.gspeed * 1.15; // knots -> mph
        
        // Decrement distance according to flight speed (mph / 3600 = miles per second)
        // console.log("decrementing distance for flight", flightId, "by", flightSpeed/3600.0);
        existingFlight.distance -= flightSpeed/3600.0;
        
        // Update other properties from the new flight data
        existingFlight.lat = flight.lat-(myLat-flight.lat);
        existingFlight.lon = flight.lon-(myLon-flight.lon);
        existingFlight.gspeed = flight.gspeed;
        existingFlight.callsign = flight.callsign;
        
        // Recalculate frequency based on updated distance
        const maxDist = 10.0;
        const minFreq = 110.0;
        const maxFreq = 880.0;
        existingFlight.frequency = minFreq * Math.pow(maxFreq/minFreq, 
          Math.max(0, maxDist - Math.abs(existingFlight.distance)) / maxDist
        );
      } else {
        // New flight, process it and add to the map
        const processedFlight = processFlight(flight);
        processedFlightsRef.current.set(flightId, processedFlight);
      }
    });
    
    // Convert the map values to an array for state update
    const processedFlightsArray = Array.from(processedFlightsRef.current.values());
    setProcessedFlights(processedFlightsArray);
    
    // Clean up flights that are no longer in the data
    currentFlightIds = new Set(currentFlights.data.map(f => f.fr24_id));
    processedFlightsRef.current.forEach((_, flightId) => {
      if (!currentFlightIds.has(flightId)) {
        processedFlightsRef.current.delete(flightId);
      }
    });
    
    // Update synths based on processed flights
    processedFlightsArray.forEach((flight) => {
      const flightId = flight.fr24_id;
      
      // Calculate distance from user
      const flightLat = flight.lat;
      const flightLon = flight.lon;
      const flightSpeed = flight.gspeed*1.15; //knots -> mph
      
      // Map distance to frequency (closer = higher pitch)
      // Using exponential mapping between 100Hz and 1000Hz
      const maxDist = 10.0;
      const minFreq = 110; // A2
      const maxFreq = 880; // A5
      
      // Logarithmic mapping that gives more resolution to closer distances
      let frequency = minFreq * Math.pow(maxFreq/minFreq, 
          Math.max(0, maxDist - Math.abs(flight.distance)) / maxDist
      );
      // console.log("frequency for flight", flightId, " is ", frequency);

      if (!synthsRef.current.has(flightId)) {
          // console.log("creating new synth for flight", flightId);
          // Create new synth for this flight
          const synth = new Tone.Synth({
              oscillator: {
                  type: "sine"
              },
              envelope: {
                  attack: 0.1,
                  decay: 0.2,
                  sustain: 0.5,
                  release: 0.8
              }
          }).toDestination();

          // Set initial volume based on prop
          synth.volume.value = volume;

          // Ensure frequency stays within safe bounds
          const safeFrequency = Math.max(20, Math.min(frequency, 2000));

          // Create an LFO with smaller variation range
          const lfo = new Tone.LFO({
              frequency: 0.1,
              min: safeFrequency * 0.995,
              max: safeFrequency * 1.005
          }).connect(synth.frequency);
          
          // Set volume in decibels (dB) with both minimum and maximum thresholds
          // synth.volume.value = Math.max(-50, Math.min(0, -20));
          lfo.start();
          
          synthsRef.current.set(flightId, {
              synth,
              lfo,
              note: safeFrequency
          });
          
          // Start playing the drone with safe frequency
          synth.triggerAttack(safeFrequency);
          // .log("playing drone for flight", flightId, " at frequency ", safeFrequency);                   

          // Connect to analyzer if it exists
          if (analyzerRef.current) {
            synth.connect(analyzerRef.current);
          }
      } else {
          // Update existing synth frequency and LFO range
          const { synth, lfo } = synthsRef.current.get(flightId);
          //console.log("updating drone for flight", flightId, " to frequency ", frequency);
          const safeFrequency = Math.max(20, Math.min(frequency * 0.95, 2000));
          
          // Replace rampTo with setValueAtTime for more stable frequency changes
          synth.frequency.setValueAtTime(safeFrequency, Tone.now());
          
          // Update LFO range only if the values are different
          if (lfo.min !== safeFrequency * 0.995 || lfo.max !== safeFrequency * 1.005) {
              lfo.min = safeFrequency * 0.995;
              lfo.max = safeFrequency * 1.005;
          }
      }
    });
    
    // Clean up synths for flights that are no longer in range
    currentFlightIds = new Set(currentFlights.data.map((f: any) => f.fr24_id));
    synthsRef.current.forEach((value, flightId) => {
        if (!currentFlightIds.has(flightId)) {
            value.synth.triggerRelease();
            value.synth.dispose();
            value.lfo.dispose();
            synthsRef.current.delete(flightId);
        }
    });
  };

  // Update the ref whenever flightsInArea changes
  useEffect(() => {
    flightsDataRef.current = flightsInArea;
  }, [flightsInArea]);

  // Fetch data effect
  useEffect(() => {
    const fetchFlights = async () => {
      try {
        const response = await axios.request(config);
        const flightData = response.data;
        setFlightsInArea(flightData);
        flightsDataRef.current = flightData;
      } catch (error) {
        console.error("Error fetching flights:", error);
      }
    };

    // Fetch flights every minute
    const fetchInterval = setInterval(fetchFlights, 60000);
    // Update synths every second
    const updateInterval = setInterval(updateSynths, 100);
    
    // Initial fetch
    fetchFlights();

    return () => {
        clearInterval(fetchInterval);
        clearInterval(updateInterval);
        // Cleanup synths
        synthsRef.current.forEach(({ synth, lfo }) => {
            synth.dispose();
            lfo.dispose();
        });
        synthsRef.current.clear();
    };
  }, []);

  

  // Update synths when flights data changes
  useEffect(() => {
    if (flightsInArea) {
      updateSynths();
      
      // Notify parent component about updated flights
      if (onFlightsUpdated) {
        onFlightsUpdated(Array.from(processedFlightsRef.current.values()));
      }
    }
  }, [flightsInArea, onFlightsUpdated]);

  return (<div></div>
    // <div style={{ color: 'blue', margin: 20 }}>
    //   {processedFlights.length > 0 && (
    //     <div>
    //       {/* <h4> ✈️ Flights in my area ✈️ </h4> */}
    //       <div style={{ 
    //         display: 'flex', 
    //         flexDirection: 'row', 
    //         flexWrap: 'wrap', 
    //         gap: '10px',
    //         justifyContent: 'center'
    //       }}>
    //         {processedFlights.map((flight) => {
    //           // Calculate emoji size based on distance (closer = bigger)
    //           // Assuming distance ranges from 0-100 miles, adjust as needed
    //           const minSize = 1.0;  // Minimum size multiplier
    //           const maxSize = 2.5;  // Maximum size multiplier
    //           const maxDistance = 100; // Maximum expected distance
    //           const sizeMultiplier = 1/Math.max(1, Math.abs(flight.distance/10));
              
    //           return (
    //             <div key={flight.fr24_id} style={{ 
    //               padding: '12px',
    //               border: '1px solid #ccc',
    //               borderRadius: '8px',
    //               backgroundColor: '#f8f9fa',
    //               minWidth: '180px',
    //               boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    //               display: 'flex',
    //               flexDirection: 'column',
    //               alignItems: 'center'
    //             }}>
    //               <div style={{ 
    //                 fontSize: `${sizeMultiplier * 2}rem`, 
    //                 marginBottom: '8px' 
    //               }}>
    //                 ✈️
    //               </div>
    //               <div style={{ fontWeight: 'bold' }}>
    //                 {flight.callsign || `Flight ${flight.fr24_id}`}
    //               </div>
    //               <div style={{ fontSize: '0.9rem', color: '#555' }}>
    //                 {flight.distance.toFixed(1)} miles • {flight.frequency.toFixed(0)} Hz
    //               </div>
    //               <div style={{ fontSize: '0.9rem', color: '#555' }}>
    //                 {(flight.gspeed * 1.15).toFixed(0)} mph
    //               </div>
    //             </div>
    //           );
    //         })}
    //       </div>
    //     </div>
    //   )}
    // </div>
  );
}