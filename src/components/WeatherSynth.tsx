"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale} from 'tonal';
import axios from "axios";

function cloudNoise(coverPercentage: number) {
    const noise = new Tone.Noise("brown").start();
    noise.volume.value = coverPercentage/10;
    
    // make an autofilter to shape the noise
    const filter = new Tone.Filter({
      frequency: 100,
      type: "lowpass",
      rolloff: -48
    }).toDestination();

    // connect the noise
    noise.connect(filter);
}

export default function WeatherSynth() {
  const [myWeather, setMyWeather] = useState<any | null>(null);
  const synthRef = useRef<any>(null);
  const arpeggioRef = useRef<any>(null);
  
  // TODO: make this based on user location, with permission
  const myLat = 33.44;
  const myLon = -94.04;

  const weatherApiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
  console.log("weatherApiKey", weatherApiKey);
  let myWeatherRequest = `https://api.openweathermap.org/data/3.0/onecall?lat=${myLat}&lon=${myLon}&appid=${weatherApiKey}&units=imperial`;

  // Initialize synth and arpeggiator only once
  useEffect(() => {
    synthRef.current = new Tone.Synth({
      oscillator: {
        type: "sine"
      }
    }).toDestination();

    synthRef.current.volume.value = -10;
    arpeggioRef.current = new Tone.Pattern((time, note) => {
      synthRef.current.triggerAttackRelease(note, '8n', time);
    }, ["C4"], "upDown");

    // Cleanup function
    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
      }
      if (arpeggioRef.current) {
        arpeggioRef.current.dispose();
      }
    };
  }, []);

  const getScaleNotes = (temp: number) => {
    let scale = temp < 32 ? ["E3", "A3", "B3", "E4"]
    : temp < 60? ["C4", "E4", "G4", "E4"]
    : ["D4", "A4", "C#5", "D5"];
    return scale;
  }

  useEffect(() => {    
    const fetchWeather = async () => {
      try {
        console.log("fetching weather with request", myWeatherRequest);
        const response = await axios.get(myWeatherRequest);

        // Get cloud override from URL if it exists
        const urlParams = new URLSearchParams(window.location.search);
        const cloudOverride = urlParams.get('clouds');
        const tempOverride = urlParams.get('feels_like');

        const weatherData = response.data.current;
        if (cloudOverride !== null) {
          weatherData.clouds = parseInt(cloudOverride);
        }
        if (tempOverride !== null) {
          weatherData.feels_like = parseInt(tempOverride);
        }
        
        setMyWeather(weatherData);
        if (response.data.current.clouds >= 0) {
            console.log("playing cloud noise");
            //cloudNoise(response.data.current.clouds);
        }

        // Update arpeggio pattern with weather-based scale
        const scaleNotes = getScaleNotes(weatherData.feels_like);
        if (arpeggioRef.current) {
          arpeggioRef.current.values = scaleNotes;
          
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
  }, []);

  return (
    <div>
      {myWeather && (
        <h4>
          Temperature: {myWeather.temp}°F, Feels Like: {myWeather.feels_like}°F, Clouds: {myWeather.clouds}%
        </h4>
      )}
    </div>
  );
}