"use client";

import { useEffect, useRef, useState } from "react";

interface WikimediaEventData {
  title: string;
  meta: { dt: string };
  performer?: { user_text: string };
  comment?: string;
  parsedcomment?: string;
  $schema?: string;
}

export default function WikiSynth() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>("");

  useEffect(() => {
    // Initialize Audio Context
    audioContextRef.current = new AudioContext();
    
    // Create nodes
    oscillatorRef.current = audioContextRef.current.createOscillator();
    gainNodeRef.current = audioContextRef.current.createGain();
    filterRef.current = audioContextRef.current.createBiquadFilter();

    // Configure nodes
    if (oscillatorRef.current && gainNodeRef.current && filterRef.current) {
      oscillatorRef.current.type = 'sine';
      oscillatorRef.current.frequency.setValueAtTime(440, audioContextRef.current.currentTime);
      
      gainNodeRef.current.gain.setValueAtTime(0, audioContextRef.current.currentTime);
      
      filterRef.current.type = 'lowpass';
      filterRef.current.frequency.setValueAtTime(1000, audioContextRef.current.currentTime);
      filterRef.current.Q.setValueAtTime(1, audioContextRef.current.currentTime);

      // Connect nodes
      oscillatorRef.current
        .connect(filterRef.current)
        .connect(gainNodeRef.current)
        .connect(audioContextRef.current.destination);

      // Start oscillator
      oscillatorRef.current.start();
    }

    const eventSource = new EventSource('/api/wiki-stream');

    const handleChange = (data: WikimediaEventData) => {
      if (!audioContextRef.current || !oscillatorRef.current || !gainNodeRef.current || !filterRef.current) return;

      // Generate musical parameters from the data
      const titleLength = data.title.length;
      const baseFrequency = 220; // A3 note
      const frequency = baseFrequency * (1 + (titleLength % 12) / 12); // Map title length to musical scale
      
      // Update oscillator frequency
      oscillatorRef.current.frequency.setTargetAtTime(
        frequency,
        audioContextRef.current.currentTime,
        0.1
      );

      // Create a short envelope for each event
      const now = audioContextRef.current.currentTime;
      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(0, now);
      gainNodeRef.current.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gainNodeRef.current.gain.exponentialRampToValueAtTime(0.01, now + 1);

      // Modulate filter based on user activity
      const filterFreq = 500 + (data.performer ? 2000 : 1000);
      filterRef.current.frequency.setTargetAtTime(
        filterFreq,
        audioContextRef.current.currentTime,
        0.1
      );

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
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const toggleAudio = () => {
    if (!audioContextRef.current) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
      setIsPlaying(true);
    } else if (audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
      setIsPlaying(false);
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={toggleAudio}
          className={`px-4 py-2 rounded ${
            isPlaying
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-green-500 hover:bg-green-600'
          } text-white transition-colors`}
        >
          {isPlaying ? 'Mute Synth' : 'Start Synth'}
        </button>
        <div className="text-sm text-gray-600">
          Last event: {lastEvent || 'None'}
        </div>
      </div>
      <div className="text-sm text-gray-500">
        Each Wikipedia edit creates a unique sound based on the title length and editor activity.
      </div>
    </div>
  );
}
