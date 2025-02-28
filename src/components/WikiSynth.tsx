"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { Chord, Interval, Note, Scale } from 'tonal';

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

export default function WikiSynth({ 
  scale, 
  volume,
  onAnalyzerCreated 
}: { 
  scale: string[], 
  volume: number,
  onAnalyzerCreated?: (analyzer: Tone.Analyser) => void
}) {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  const [lastEvent, setLastEvent] = useState<string>("");

  useEffect(() => {
    if (synthRef.current) {
      console.log("setting wikipedia volume to ", volume);
      synthRef.current.volume.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    // Create a filter
    filterRef.current = new Tone.Filter({
      type: "highpass",
      frequency: 50,
      Q: 1
    }).toDestination();
    
    // Create analyzer
    analyzerRef.current = new Tone.Analyser("waveform", 1024);
    
    // Create synth and connect to filter and analyzer
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
    }).connect(filterRef.current).connect(analyzerRef.current);

    console.log("setting initial wikipedia volume to ", volume);
    synthRef.current.volume.value = volume;

    const eventSource = new EventSource('/api/wiki-stream');

    const handleChange = (data: WikimediaEventData) => {
      if (!synthRef.current || !filterRef.current) return;

      // Generate musical parameters from the data
      const titleLength = data.title.length;
      const length_delta = (data.length?.new || 0) - (data.length?.old || 0);

      const frequency = scale[titleLength % scale.length];

      // Update filter based on user activity
      const filterFreq = data.performer ? 2000 : 1000;
      filterRef.current.frequency.rampTo(filterFreq, 0.1);

      // Play the note with more extreme volume variation
      if (Tone.context.state === "running") {
        // More extreme sigmoid curve with steeper slope
        let velocity = 1/(1+Math.exp(-length_delta*.5)); 
        
        // Apply additional scaling to make quiet edits quieter and loud edits louder
        velocity = Math.pow(velocity, 2) * 1.5;
        
        // Ensure velocity stays in valid range (0-1)
        velocity = Math.min(1, Math.max(0.05, velocity));
        
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

    // Notify parent component about the analyzer
    if (onAnalyzerCreated && analyzerRef.current) {
      onAnalyzerCreated(analyzerRef.current);
    }

    return () => {
      eventSource.close();
      if (synthRef.current) {
        synthRef.current.dispose();
      }
      if (filterRef.current) {
        filterRef.current.dispose();
      }
      if (analyzerRef.current) {
        analyzerRef.current.dispose();
      }
    };
  }, [onAnalyzerCreated]);
  return (
    <div />
  );
}