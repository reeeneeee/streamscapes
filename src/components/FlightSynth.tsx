"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale} from 'tonal';
import axios from "axios";


export default function FlightSynth() {
  const [flightsInArea, setFlightsInArea] = useState<any | null>(null);
  const synthsRef = useRef<Map<string, any>>(new Map());
  const listenerRef = useRef<any>(null);
  const [currentFlights, setCurrentFlights] = useState<any[]>([]);
  const [processedFlights, setProcessedFlights] = useState<any[]>([]);
  
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

 
  useEffect(() => {
    let flightData: any = null;
    
    const processFlightData = (flight: any) => {
      const distance = Math.sqrt(
        Math.pow((flight.lat - myLat)*69, 2) + 
        Math.pow((flight.lon - myLon)*69, 2)
      );
      const maxDist = 10.0;
      const minFreq = 110.0;
      const maxFreq = 880.0;
      let frequency = minFreq * Math.pow(maxFreq/minFreq, 
        Math.max(0, maxDist - distance) / maxDist
      );
      
      return {
        ...flight,
        distance,
        frequency
      };
    };

    const updateSynths = () => {
      if (!flightData) return;
      
      const processedData = flightData.data.map(processFlightData);
      setProcessedFlights(processedData);
      
      processedData.forEach((flight) => {
        const flightId = flight.fr24_id;
        
        // Calculate distance from user
        const flightLat = flight.lat;
        const flightLon = flight.lon;
        const flightSpeed = flight.gspeed*1.15; //knots -> mph
        console.log("flightLat", flightLat, " flightLon", flightLon);
        // roughly converted to miles
        const distance = Math.sqrt(
            Math.pow((flightLat - myLat)*69, 2) + 
            Math.pow((flightLon - myLon)*69, 2)
        );
        console.log("distance for flight", flightId, " is ", distance);
        // Map distance to frequency (closer = higher pitch)
        // Using exponential mapping between 100Hz and 1000Hz
        const maxDist = 10.0;
        const minFreq = 110; // A2
        const maxFreq = 880; // A5
        
        // Logarithmic mapping that gives more resolution to closer distances
        let frequency = minFreq * Math.pow(maxFreq/minFreq, 
            Math.max(0, maxDist - distance) / maxDist
        );
        console.log("frequency for flight", flightId, " is ", frequency);

        if (!synthsRef.current.has(flightId)) {
            console.log("creating new synth for flight", flightId);
            // Create new synth for this flight
            const synth = new Tone.Synth({
                oscillator: {
                    type: "sine"
                },
                envelope: {
                    attack: 0.1,
                    decay: 0.2,
                    sustain: 1,
                    release: 0.8
                }
            }).toDestination();

            // Create an LFO for continuous pitch variation
            const lfo = new Tone.LFO({
                frequency: 0.1, // oscillation speed (cycles per second)
                min: frequency * 0.99, // minimum frequency
                max: frequency * 1.01  // maximum frequency
            }).connect(synth.frequency);
            
            synth.volume.value = -10;
            lfo.start();
            
            synthsRef.current.set(flightId, {
                synth,
                lfo,
                note: frequency
            });
            
            // Start playing the drone
            synth.triggerAttack(frequency);
            console.log("playing drone for flight", flightId, " at frequency ", frequency);                   
        } else {
            // Update existing synth frequency and LFO range
            const { synth, lfo } = synthsRef.current.get(flightId);
            console.log("updating drone for flight", flightId, " to frequency ", frequency);
            frequency = frequency * 0.95;
            synth.frequency.rampTo(frequency, 1);
            lfo.min = frequency * 0.95;
            lfo.max = frequency * 1.05;
            console.log("updating drone for flight", flightId, " to frequency ", frequency);
        }
      });
      
      // Clean up synths for flights that are no longer in range
      const currentFlightIds = new Set(flightData.data.map((f: any) => f.fr24_id));
      synthsRef.current.forEach((value, flightId) => {
          if (!currentFlightIds.has(flightId)) {
              value.synth.triggerRelease();
              value.synth.dispose();
              value.lfo.dispose();
              synthsRef.current.delete(flightId);
          }
      });
    };

    const fetchFlights = async () => {
      try {
        const response = await axios.request(config);
        setFlightsInArea(response.data);
        flightData = response.data;
        setCurrentFlights(response.data.data);
        updateSynths();
      } catch (error) {
        console.error("Error fetching flights:", error);
      }
    };

    // Fetch flights every minute
    const fetchInterval = setInterval(fetchFlights, 60000);
    // Update synths every second
    const updateInterval = setInterval(updateSynths, 1000);
    
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


  return (
    <div style={{ color: 'blue', margin: 20 }}>
      {processedFlights.length > 0 && (
        <div>
          <h4> ✈️ Flights in my area ✈️ </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {processedFlights.map((flight) => (
              <div key={flight.fr24_id} style={{ 
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}>
                Flight {flight.fr24_id}: {flight.callsign || 'No callsign'}<br/>
                Distance: {flight.distance.toFixed(2)} miles<br/>
                Frequency: {flight.frequency.toFixed(1)} Hz<br/>
                Speed: {(flight.gspeed * 1.15).toFixed(0)} mph
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}