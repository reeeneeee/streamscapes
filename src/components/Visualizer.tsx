"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone';

// Import p5 only on client side
let p5: any;
if (typeof window !== 'undefined') {
  p5 = require('p5');
}

interface ProcessedFlight {
    fr24_id: string;
    lat: number;
    lon: number;
    gspeed: number;
    distance: number;
    frequency: number;
    callsign?: string;
  }

interface WikiEdit {
  title: string;
  url: string;
  timestamp: string;
  size: number; // Size of the edit
  age: number; // How many seconds old the edit is
  id: string; // Unique ID for each edit
  position: { x: number; y: number; }; // Fixed position
}

interface VisualizerProps {
  weatherAnalyzer: Tone.Analyser | null;
  flights: ProcessedFlight[];
  flightAnalyzer: Tone.Analyser | null;
  myLat: number;
  myLon: number;
  wikiAnalyzer: Tone.Analyser | null;
  height?: number;
  backgroundColor?: string;
}

const Visualizer = ({
    weatherAnalyzer,
    flights,
    flightAnalyzer,
    myLat,
    myLon,
    wikiAnalyzer,
    height = 300,
    backgroundColor = "#111111"
}: VisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<any | undefined>(undefined);
  const editsRef = useRef<WikiEdit[]>([]);
  const [, setUpdateTrigger] = useState(0); // Only used to trigger re-renders
  const [planefront, setPlanefront] = useState<any | undefined>(undefined);
  const [planeback, setPlaneback] = useState<any | undefined>(undefined);
  const imagesLoadedRef = useRef(false);


  // Listen for wiki edits via EventSource
  useEffect(() => {
    const eventSource = new EventSource('/api/wiki-stream');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.server_name === "en.wikipedia.org" && 
            data.type === "edit" && 
            !data.title.includes(":")) {
          
          const editSize = data.length ? Math.abs(data.length.new - data.length.old) : 10;
          
          // Generate a fixed position based on the title
          const seed = data.title.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          const containerWidth = containerRef.current?.clientWidth || 400;
          const x = (seed % 1000) / 1000 * (containerWidth - 100) + 50;
          const y = ((seed % 500) / 500) * (height - 100) + 50;
          
          // Add new edit with timestamp and fixed position
          const newEdit = {
            title: data.title,
            url: data.notify_url || "",
            timestamp: new Date().toISOString(),
            size: Math.min(100, Math.max(10, editSize)), // Clamp size between 10-100
            age: 0,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            position: { x, y }
          };
          
          editsRef.current = [newEdit, ...editsRef.current].slice(0, 50); // Keep last 50 edits
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };
    
    return () => {
      eventSource.close();
    };
  }, [height]);
  
  // Update edit ages every second
  useEffect(() => {
    const interval = setInterval(() => {
      editsRef.current = editsRef.current
        .map(edit => ({
          ...edit,
          age: edit.age + 1
        }))
        .filter(edit => edit.age < 30); // Remove edits older than 30 seconds
      
      // Trigger re-render
      setUpdateTrigger(prev => prev + 1);
    }, 100);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !p5) return;

    const sketch = (p: any) => {
      // Preload airplane images
      const planefront = p.loadImage('/plane-front.svg');
      const planeback = p.loadImage('/plane-back.svg');
      
      p.preload = () => {
        // Load airplane SVGs
        try {
          imagesLoadedRef.current = true;
        } catch (err) {
          console.error("Error loading airplane images:", err);
          imagesLoadedRef.current = false;
        }
      };

      p.setup = () => {
        const canvas = p.createCanvas(
          containerRef.current?.clientWidth || 400,
          height
        );
        canvas.parent(containerRef.current!);
        setPlanefront(planefront);
        setPlaneback(planeback);
      };

      p.draw = () => {
        p.background(backgroundColor);
        
        // NOTE: this is currently a hack and assumes every flight is flying from current location toward the user
        // TODO: don't show a plane until it's been detected twice and impute flight path from that

        // Draw flights at evenly spaced intervals
        if (flights && flights.length > 0) {
            // Calculate spacing
            const numFlights = flights.length;
            flights.forEach((flight, index) => {
  
            const x = p.width/(numFlights+1)*(index+1);
            const y = p.height/5; 
              
            const size = p.map(1/flight.distance, 0, 1, 20, 60);
              
            p.fill(0, 255, 0);
            p.noStroke();
            const hue = p.map(flight.frequency, 110, 880, 240, 0);
            p.colorMode(p.HSB, 360, 100, 100);
            
            p.imageMode(p.CENTER);
              const img = flight.distance > 0? planefront : planeback; 

             p.image(img, x, y, size, size);

              // Draw callsign if available
              if (flight.callsign) {
                p.fill('#5C7285');
                p.textSize(20);
                p.textAlign(p.CENTER, p.CENTER);
                p.text(flight.callsign, x, y + size/2 + 15);
              }
            });
          }

        // Draw edits as shrinking circles
        const currentEdits = editsRef.current;
        currentEdits.forEach(edit => {
          // Calculate size based on edit size and age
          const maxSize = edit.size;
          const currentSize = maxSize * (1 - edit.age / 30); // Shrink over 30 seconds
          
          // Use the pre-calculated position
          const x = edit.position.x;
          const y = edit.position.y;
           
          // Draw ripple effect with proper alpha transparency
          for (let i = 3; i >= 0; i--) {
            const rippleSize = currentSize * (1 + i * 0.3);
            const alpha = p.map(i, 0, 3, 200, 25); // Map to 0-255 alpha values
            p.noFill();
            p.stroke(93, 135, 54, alpha); // #5D8736 with alpha
            p.strokeWeight(2);
            p.ellipse(x, y, rippleSize, rippleSize);
          }
          
          // Draw main circle
          p.fill('#5D8736');
          p.noStroke();
          p.ellipse(x, y, currentSize, currentSize);
          
          // Draw title for larger edits
          if (edit.size > 30 && edit.age < 20) {
            p.textSize(15);
            p.textAlign(p.CENTER, p.CENTER);
            // Truncate long titles
            const displayTitle = edit.title.length > 25 
              ? edit.title.substring(0, 22) + '...' 
              : edit.title;
            
            // Draw the title with a different color to indicate it's clickable
            p.fill('#2d2d2d');
            p.text(displayTitle, x, y + currentSize);
            
            // Draw a subtle underline to indicate it's a link
            const textWidth = p.textWidth(displayTitle);
            p.stroke('#2d2d2d');
            p.strokeWeight(1);
            p.line(x - textWidth/2, y + currentSize + 5, x + textWidth/2, y + currentSize + 5);
          }
        });
        
        // Draw wiki waveform if analyzer is available
        if (wikiAnalyzer) {
          const data = wikiAnalyzer.getValue() as Float32Array;
          p.stroke('#5D8736');
          p.strokeWeight(2);
          p.noFill();
          p.beginShape();
          for (let i = 0; i < data.length; i++) {
            const x = p.map(i, 0, data.length, 0, p.width);
            const y = p.map(data[i], -1, 1, p.height - 50, p.height - 10);
            p.vertex(x, y);
          }
          p.endShape();
        }

        // Draw flight waveform if analyzer is available
        if (flightAnalyzer) {
          const data = flightAnalyzer.getValue() as Float32Array;
          p.stroke('#5C7285');
          p.strokeWeight(2);
          p.noFill();
          p.beginShape();
          for (let i = 0; i < data.length; i++) {
            const x = p.map(i, 0, data.length, 0, p.width);
            const y = p.map(data[i], -1, 1, p.height - 50, p.height - 10);
            p.vertex(x, y);
          }
          p.endShape();
        }

        // Draw weather waveform if analyzer is available
        if (weatherAnalyzer) {
          const data = weatherAnalyzer.getValue() as Float32Array;
          p.stroke('#7C444F');
          p.strokeWeight(2);
          p.noFill();
          p.beginShape();
          for (let i = 0; i < data.length; i++) {
            const x = p.map(i, 0, data.length, 0, p.width);
            const y = p.map(data[i], -1, 1, p.height - 50, p.height - 10);
            p.vertex(x, y);
          }
          p.endShape();
        }

        // Add mouseClicked handler to handle clicks on wikipedia edit titles
        p.mouseClicked = () => {
          // Check if click is on any edit title
          for (const edit of currentEdits) {
              const x = edit.position.x;
              const y = edit.position.y;
              const currentSize = edit.size * (1 - edit.age / 30);
              
              // Check if mouse is near the title text or circle
              const textY = y + currentSize;
              if (p.dist(p.mouseX, p.mouseY, x, textY) < 50 || p.dist(p.mouseX, p.mouseY, x, y) < currentSize) {
                // Open the Wikipedia page in a new tab
                window.open(edit.url, '_blank');
                return false; // Prevent default behavior
              }
          }
          return true;
        };
      };
      
      p.windowResized = () => {
        if (containerRef.current) {
          p.resizeCanvas(
            containerRef.current.clientWidth,
            height
          );
        }
      };
    };

    // Create new p5 instance
    p5Ref.current = new p5(sketch);

    // Cleanup function
    return () => {
      if (p5Ref.current) {
        if (p5Ref.current.remove) {
          p5Ref.current.remove();
        } else {
          const canvas = document.querySelector(`canvas[data-p5-id="${p5Ref.current.id}"]`);
          if (canvas) {
            canvas.remove();
          }
          p5Ref.current = undefined;
        }
      }
    };
  }, [weatherAnalyzer, flights, flightAnalyzer, myLat, myLon, wikiAnalyzer, height, backgroundColor]);

  return (
    <div className="w-full mb-4">
      <h4 className="mb-2 text-sm font-medium"></h4>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height }} />
    </div>
  );
};

export default Visualizer; 