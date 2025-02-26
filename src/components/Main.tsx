"use client";

import WeatherSynth from "@/components/WeatherSynth";
import WikiSynth from "@/components/WikiSynth";
import WikiStream from "@/components/WikiStream";

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

export default function Main() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedScale, setSelectedScale] = useState<ScaleType>('Major Pentatonic');

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
            <div className="p-4 bg-background/50 shadow rounded backdrop-blur-sm">
                <div className="flex items-center gap-4 mb-4">
                    <div>
                        <button
                            onClick={soundOn}
                            id="sound-button"
                            className={`px-4 py-2 rounded ${isPlaying
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-green-500 hover:bg-green-600'
                                } text-white transition-colors`}
                        >
                            {isPlaying ? 'Mute Synth' : 'Start Synth'}
                        </button>
                    </div>
                    <div>
                        <select
                            id="scale-select"
                            style={{ visibility: 'hidden' }}
                            value={selectedScale}
                            onClick={soundOn}
                            onChange={(e) => setSelectedScale(e.target.value as ScaleType)}
                            className="px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground border-secondary/30"
                        >
                            {Object.keys(SCALE_OPTIONS).map((scale) => (
                                <option key={scale} value={scale}>
                                    {scale}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <WeatherSynth />
            <WikiSynth scale={currentScale} />
            <div className="mt-8">
                <WikiStream />
            </div>
        </div>
    );
}