"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale} from 'tonal';
import axios from "axios";

function cloudNoise(coverPercentage: number, volume: number) {
    const noise = new Tone.Noise("brown").start();
    noise.volume.value = coverPercentage/100*(volume+3);
    
    // make an autofilter to shape the noise
    const filter = new Tone.Filter({
      frequency: 100,
      type: "lowpass",
      rolloff: -48
    }).toDestination();

    // connect the noise
    noise.connect(filter);
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
  // Add more detailed logging
  console.log("WeatherSynth rendered with scale:", scale);
  console.log("Scale type:", typeof scale);
  console.log("Scale length:", scale?.length);
  
  const [myWeather, setMyWeather] = useState<any | null>(null);
  const synthRef = useRef<any>(null);
  const arpeggioRef = useRef<any>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  
  // TODO: make this based on user location, with permission
  const myLat = 40.6711;
  const myLon = -73.9814;

  const weatherApiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
  let myWeatherRequest = `https://api.openweathermap.org/data/3.0/onecall?lat=${myLat}&lon=${myLon}&appid=${weatherApiKey}&units=imperial`;

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
    console.log("getArpeggioNotes called with scale:", scale);
    
    // Check if scale is valid before using it
    if (!scale || scale.length === 0) {
      console.error("Scale is empty or undefined in getArpeggioNotes");
      return ["C4", "E4", "G4", "C5"]; // Fallback to C major
    }
    
    // Use the scale passed as prop to create arpeggios
    // Get the root note and octave from the first note in the scale
    const rootNote = scale[0].slice(0, -1); // Remove octave number
    const octave = parseInt(scale[0].slice(-1));
    
    console.log("Root note:", rootNote, "Octave:", octave);
    
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
    console.log("Weather useEffect running with scale:", scale);
    
    const fetchWeather = async () => {
      try {
        console.log("fetching weather with request", myWeatherRequest);
        const response = await axios.get(myWeatherRequest);
        const weatherData = response.data.current;

        // Get cloud override from URL if it exists
        const urlParams = new URLSearchParams(window.location.search);
        const cloudOverride = urlParams.get('clouds');
        const tempOverride = urlParams.get('feels_like');
        if (cloudOverride !== null) {
          weatherData.clouds = parseInt(cloudOverride);
        }
        if (tempOverride !== null) {
          weatherData.feels_like = parseInt(tempOverride);
        }
        
        setMyWeather(weatherData);
        if (response.data.current.clouds >= 0) {
            console.log("playing cloud noise");
            cloudNoise(response.data.current.clouds, volume);
        }

        // Update arpeggio pattern with weather-based scale
        console.log("WeatherSynth scale", scale);
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

  // Add another useEffect just to monitor scale changes
  useEffect(() => {
    console.log("Scale changed to:", scale);
  }, [scale]);

  return (
    <div style={{ fontSize: '20px', textAlign: 'center', margin: 20 }}>
      {myWeather && (
        <h4>
          🌡️: {myWeather.feels_like}°F, ☁️: {myWeather.clouds}%
        </h4>
      )}
    </div>
  );
}