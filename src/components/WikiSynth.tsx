"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale} from 'tonal';
import axios from "axios";

const SCALE_OPTIONS = {
  'Major Pentatonic': Scale.get('C4 Major Pentatonic').notes,
  'Minor Pentatonic': Scale.get('C4 Minor Pentatonic').notes,
  'Major': Scale.get('C4 Major').notes,
  'Minor': Scale.get('C4 Minor').notes,
  'Blues': Scale.get('C4 Blues').notes,
  'Chromatic': Scale.get('C4 Chromatic').notes,
} as const;
let selectedScale = 'Major Pentatonic';
let currentScale = SCALE_OPTIONS['Major Pentatonic'];

type ScaleType = keyof typeof SCALE_OPTIONS;

interface WikimediaEventData {
  title: string;
	meta: { dt: string };
	performer?: { user_text: string };
	server_name?: string; 
	length?: { old: number | 0, new: number | 0 };
	minor?: boolean;
	comment?: string;
	type?: string;
	parsedcomment?: string;
	$schema?: string;
}

export default function WikiSynth() {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>("");
  const [selectedScale, setSelectedScale] = useState<ScaleType>('Major Pentatonic');
  
  useEffect(() => {
    // Create a filter
    filterRef.current = new Tone.Filter({
      type: "highpass",
      frequency: 50,
      Q: 1
    }).toDestination();

    // Create a synth and connect it to the filter
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: "sine"
        },
        envelope: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.1,
          release: 0.1
        },
      }).connect(filterRef.current);

    const eventSource = new EventSource('/api/wiki-stream');

    
    const handleChange = (data: WikimediaEventData) => {
      if (!synthRef.current || !filterRef.current) return;

      // Generate musical parameters from the data
      const titleLength = data.title.length;
      const length_delta  = (data.length?.new || 0) - (data.length?.old || 0);
      currentScale = SCALE_OPTIONS[selectedScale];
      
      const frequency = currentScale[titleLength % currentScale.length];

      // Update filter based on user activity
      const filterFreq = data.performer ? 2000 : 1000;
      filterRef.current.frequency.rampTo(filterFreq, 0.1);

      // Play the note
      if (Tone.context.state === "running") {
        let velocity = 1/(1+Math.exp(-length_delta*.2));
        console.log("Playing note ", frequency, ' for ', data.title, " at ", velocity);
        synthRef.current.triggerAttackRelease(frequency, '8n', Tone.now() + Math.random(), velocity);
      }

      setLastEvent(data.title);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: WikimediaEventData = JSON.parse(event.data);
        handleChange(data);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    return () => {
      eventSource.close();
      if (synthRef.current) {
        synthRef.current.dispose();
      }
      if (filterRef.current) {
        filterRef.current.dispose();
      }
    };
  }, [selectedScale]);

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

  useEffect(() => {
    document.documentElement.setAttribute('data-scale', selectedScale);
  }, [selectedScale]);
  // Update the scale selection handler
  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScale = e.target.value as ScaleType;
    console.log("Changing scale to:", newScale); // Debug log
    setSelectedScale(newScale);
  };
  return (
    <div className="p-4 bg-background/50 shadow rounded backdrop-blur-sm">
      <div className="flex items-center gap-4 mb-4">
        <div>
          <button
          onClick={soundOn}
          id="sound-button"
          className={`px-4 py-2 rounded ${
            isPlaying
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
  );
}