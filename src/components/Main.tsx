"use client";

import WeatherSynth from "@/components/WeatherSynth";
import WikiSynth from "@/components/WikiSynth";
import WikiStream from "@/components/WikiStream";
import FlightSynth from "@/components/FlightSynth";
import Visualizer from "@/components/Visualizer";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale } from 'tonal';
import axios from "axios";

const SCALE_OPTIONS = {
    'Major Pentatonic': Scale.get('C4 Major Pentatonic').notes,
    'Minor Pentatonic': Scale.get('C4 Minor Pentatonic').notes,
    'Major': Scale.get('C4 Major').notes,
    'Minor': Scale.get('C4 Minor').notes,
    'Blues': Scale.get('C4 Blues').notes,
    'Chromatic': Scale.get('C4 Chromatic').notes,
} as const;

type ScaleType = keyof typeof SCALE_OPTIONS;

interface ProcessedFlight {
  fr24_id: string;
  lat: number;
  lon: number;
  gspeed: number;
  distance: number;
  frequency: number;
  callsign?: string;
}

export default function Main() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedScale, setSelectedScale] = useState<ScaleType>('Major Pentatonic');
    const [flightAnalyzer, setFlightAnalyzer] = useState<Tone.Analyser | null>(null);
    const [weatherAnalyzer, setWeatherAnalyzer] = useState<Tone.Analyser | null>(null);
    const [wikiAnalyzer, setWikiAnalyzer] = useState<Tone.Analyser | null>(null);
    
    // Add volume state for each synth
    const [weatherVolume, setWeatherVolume] = useState<number>(0);
    const [flightVolume, setFlightVolume] = useState<number>(-20);
    const [wikiVolume, setWikiVolume] = useState<number>(1);

    // Add state for flight data
    const [processedFlights, setProcessedFlights] = useState<ProcessedFlight[]>([]);
    const [myWeather, setMyWeather] = useState<any>(null);
    let currentScale = SCALE_OPTIONS[selectedScale];

    const soundOn = async () => {
        const context = Tone.context;
        if (context.state === 'suspended') {
            await Tone.start();
            console.log("Audio started", isPlaying);
            setIsPlaying(true);
        }
        const scaleElement = document.getElementById('scale-select');
        if (scaleElement) {
            scaleElement.style.visibility = "visible";
        }
        document.getElementById('sound-button')?.remove();
    };

    // Update the scale selection handler
    const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newScale = e.target.value as ScaleType;
        console.log("Changing scale to:", newScale); // Debug log
        setSelectedScale(newScale);
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-scale', selectedScale);
    }, [selectedScale]);

    return (
        <div>
            {/* Center the Start Synth button and scale select at the top */}
            <div className="w-full flex flex-col items-center mt-4 mb-8">
                <button
                    onClick={soundOn}
                    id="sound-button"
                    style={{ backgroundColor: '#2d2d2d', color: '#f5f5f5' }}
                    className={`px-4 py-2 rounded ${isPlaying
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-green-500 hover:bg-green-600'
                        } text-white transition-colors`}
                >
                    {isPlaying ? 'Mute Synth' : 'Start Synth'}
                </button>
                
                <select
                    id="scale-select"
                    style={{ visibility: 'hidden', color: '#2d2d2d' }}
                    value={selectedScale}
                    onClick={soundOn}
                    onChange={(e) => setSelectedScale(e.target.value as ScaleType)}
                    className="px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground border-secondary/30 mt-0"
                >
                    {Object.keys(SCALE_OPTIONS).map((scale) => (
                        <option key={scale} value={scale}>
                            {scale}
                        </option>
                    ))}
                </select>
            </div>
            <WeatherSynth 
                scale={currentScale} 
                volume={weatherVolume} 
                onAnalyzerCreated={setWeatherAnalyzer} 
            />  
            {/* Add visualizers */}
            <div className="mt-8 space-y-6">
                
                {/* Visualizer */}
                {wikiAnalyzer && flightAnalyzer && weatherAnalyzer && (
                    <Visualizer 
                        weatherAnalyzer={weatherAnalyzer}
                        flights={processedFlights}
                        flightAnalyzer={flightAnalyzer}
                        myLat={40.6711}
                        myLon={-73.9814}
                        wikiAnalyzer={wikiAnalyzer}
                        height={500}
                        backgroundColor="#f5f5f5"
                    />
                )}
            </div>

            <div className="p-4 bg-background/50 shadow rounded backdrop-blur-sm">
                {/* Volume Controls */}
                <div className="space-y-3">
                    <div className="flex items-center gap-4">
                        <span className="w-24 text-sm" style={{ fontWeight: 'bold', color: '#7C444F' }}>Weather</span>
                        <input 
                            type="range" 
                            min="-20" 
                            max="5" 
                            step="0.1" 
                            value={weatherVolume}
                            onChange={(e) => setWeatherVolume(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="w-10 text-sm text-right"></span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <span className="w-24 text-sm" style={{ fontWeight: 'bold', color: '#5C7285' }}>Flights</span>
                        <input 
                            type="range" 
                            min="-40" 
                            max="-5" 
                            step="0.1" 
                            value={flightVolume}
                            onChange={(e) => setFlightVolume(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="w-10 text-sm text-right"></span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <span className="w-24 text-sm" style={{ fontWeight: 'bold', color: '#5D8736' }}>Wikipedia</span>
                        <input 
                            type="range" 
                            min="-20" 
                            max="10"
                            step="0.1" 
                            value={wikiVolume}
                            onChange={(e) => setWikiVolume(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="w-10 text-sm text-right"></span>
                    </div>
                </div>
            </div>
            
            <FlightSynth 
                volume={flightVolume} 
                onAnalyzerCreated={setFlightAnalyzer}
                onFlightsUpdated={setProcessedFlights}
                
            />
            

            {/* Pass callbacks to synth components */}
             
            
            <WikiSynth 
                scale={currentScale} 
                volume={wikiVolume} 
                onAnalyzerCreated={setWikiAnalyzer} 
            />
            {/* { <div className="mt-8">
                <WikiStream />
            </div> } */}
        </div>
    );
}