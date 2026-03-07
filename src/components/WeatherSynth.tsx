"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Scale } from 'tonal';
import { useUserLocation } from '../hooks/useUserLocation';

// Cloud noise refs — stored at module level to prevent leaks
let cloudNoiseNode: Tone.Noise | null = null;
let cloudFilterNode: Tone.Filter | null = null;

function disposeCloudNoise() {
  if (cloudNoiseNode) {
    cloudNoiseNode.stop();
    cloudNoiseNode.dispose();
    cloudNoiseNode = null;
  }
  if (cloudFilterNode) {
    cloudFilterNode.dispose();
    cloudFilterNode = null;
  }
}

function cloudNoise(coverPercentage: number, volume: number) {
    // Dispose previous noise/filter before creating new ones
    disposeCloudNoise();

    cloudNoiseNode = new Tone.Noise("brown").start();
    cloudNoiseNode.volume.value = coverPercentage/100*(volume+3);

    cloudFilterNode = new Tone.Filter({
      frequency: 100,
      type: "lowpass",
      rolloff: -48
    }).toDestination();

    cloudNoiseNode.connect(cloudFilterNode);
}

export default function WeatherSynth({ 
  scale, 
  volume,
  onAnalyzerCreated 
}: { 
  scale: string[], 
  volume: number,
  onAnalyzerCreated?: (analyzer: Tone.Analyser) => void
}) {
  const [myWeather, setMyWeather] = useState<any | null>(null);
  const synthRef = useRef<any>(null);
  const arpeggioRef = useRef<any>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  
  const { location, loading } = useUserLocation();
  
  // Remove the hardcoded coordinates and use location from hook
  const myLat = location.lat;
  const myLon = location.lon;

  const myWeatherRequest = `/api/streams/weather?lat=${myLat}&lon=${myLon}`;

  // Initialize synth, arpeggiator, and analyzer
  useEffect(() => {
    // Create analyzer
    analyzerRef.current = new Tone.Analyser("waveform", 1024);
    
    // Create synth and connect to analyzer
    synthRef.current = new Tone.Synth({
      oscillator: {
        type: "sine"
      }
    }).connect(analyzerRef.current).toDestination();

    //synthRef.current.volume.value = -10;
    arpeggioRef.current = new Tone.Pattern((time, note) => {
      synthRef.current.triggerAttackRelease(note, '8n', time);
    }, ["C4"], "upDown");

    // Notify parent component about the analyzer
    if (onAnalyzerCreated && analyzerRef.current) {
      onAnalyzerCreated(analyzerRef.current);
    }
    
    // Cleanup function
    return () => {
      disposeCloudNoise();
      if (synthRef.current) {
        synthRef.current.dispose();
      }
      if (arpeggioRef.current) {
        arpeggioRef.current.dispose();
      }
      if (analyzerRef.current) {
        analyzerRef.current.dispose();
      }
    };
  }, [onAnalyzerCreated]);

  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.volume.value = volume; 
    }
  }, [volume]);

  const getArpeggioNotes = (temp: number) => {
    // Check if scale is valid before using it
    if (!scale || scale.length === 0) {
      return ["C4", "E4", "G4", "C5"]; // Fallback to C major
    }

    const rootNote = scale[0].slice(0, -1);
    const octave = parseInt(scale[0].slice(-1));
    
    let arpeggio;
    if (temp < 32) {
      // Cold temperature - minor feel
      arpeggio = [
        `${rootNote}${octave}`, 
        `${scale[2]}`, // Third note in scale
        `${scale[4]}`, // Fifth note in scale
        `${rootNote}${octave + 1}` // Root an octave higher
      ];
    } else if (temp < 60) {
      // Moderate temperature - major feel
      arpeggio = [
        `${rootNote}${octave}`,
        `${scale[2]}`,
        `${scale[4]}`,
        `${scale[2]}`
      ];
    } else {
      // Warm temperature - more complex pattern
      arpeggio = [
        `${scale[1]}`, // Second note
        `${scale[4]}`, // Fifth note
        `${scale[6]}`, // Seventh note
        `${rootNote}${octave + 1}` // Root an octave higher
      ];
    }
    return arpeggio;
  }

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch(myWeatherRequest);
        const data = await response.json();
        const weatherData = data.current;

        setMyWeather(weatherData);
        if (weatherData.clouds >= 0) {
            cloudNoise(weatherData.clouds, volume);
        }

        const arpeggioNotes = getArpeggioNotes(weatherData.feels_like);
        if (arpeggioRef.current) {
          arpeggioRef.current.values = arpeggioNotes;
          
          // Start the transport and pattern
          Tone.Transport.bpm.value = 100;
          Tone.Transport.start();
          arpeggioRef.current.start();
        }
      } catch (error) {
        console.error("Error fetching weather data:", error);
      }
    };

    fetchWeather();
  }, [scale, myWeatherRequest]);

  // You might want to show a loading state
  if (loading) {
    return <div>Loading location data...</div>;
  }

  return (
    <div style={{ fontSize: '16px', textAlign: 'center', margin: 20 }}>
      {myWeather && (
        <h4>
          📍 {location.lat.toFixed(4)}, {location.lon.toFixed(4)} <br/>
          🌡️: {Math.trunc(myWeather.feels_like)}°F, ☁️: {myWeather.clouds}%
        </h4>
      )}
    </div>
  );
}