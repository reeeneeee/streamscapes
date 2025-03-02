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
    vector?: {
      latPerSecond: number;
      lonPerSecond: number;
      lastUpdated: number;
    };
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
  backgroundColor?: string;
  scale: string[];
}

const Visualizer = ({
    weatherAnalyzer,
    flights,
    flightAnalyzer,
    myLat,
    myLon,
    wikiAnalyzer,
    backgroundColor,
    scale
}: VisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<any | undefined>(undefined);
  const editsRef = useRef<WikiEdit[]>([]);
  const [, setUpdateTrigger] = useState(0); // Only used to trigger re-renders
  const [airplane, setAirplane] = useState<any | undefined>(undefined);
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
          const y = ((seed % 500) / 500) * (containerWidth - 100) + 50;
          
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
  }, []);
  
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
      const airplane = p.loadImage('/airplane.svg');
      
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
          containerRef.current?.clientWidth || 400
        );
        canvas.parent(containerRef.current!);
        setAirplane(airplane);
      };

      p.draw = () => {
        p.background(backgroundColor);
        
        // Draw distance circles around user's location
        // Use properly spaced circles with different radii
        const distanceCircles = [1, 5, 10]; // Miles
        p.noFill();
        
        distanceCircles.forEach(miles => {
          // Convert miles to lat/lon degrees (approximate)
          // 1 degree of latitude ≈ 69 miles
          const latRadius = miles / 69;
          const lonRadius = miles / 69;
          
          // Use the same scale factor as for flights
          const latScale = p.height * 3;
          const lonScale = p.width * 3;
          
          // Calculate pixel radius
          const pixelRadiusLat = latRadius * latScale;
          const pixelRadiusLon = lonRadius * lonScale;
          
          // Draw the circle with higher contrast
          p.stroke('red'); // Red with alpha
          p.strokeWeight(1.5); // Slightly thinner lines
          p.ellipse(p.width/2, p.height/2, pixelRadiusLon * 2, pixelRadiusLat * 2);
        });
        
        // Draw user's location
        p.fill(255, 0, 0);
        p.noStroke();
        p.ellipse(p.width/2, p.height/2, 10, 10);
        
        // Draw flights based on their actual lat/lon coordinates
        if (flights && flights.length > 0) {
          flights.forEach((flight) => {
            // Calculate relative position from user's location
            const latDiff = flight.lat - myLat;
            const lonDiff = flight.lon - myLon;
            
            // Scale factor to convert geo coordinates to pixels
            const latScale = p.height * 3;
            const lonScale = p.width * 3;
            
            // Calculate canvas position (center of canvas is user's location)
            const x = p.width/2 + (lonDiff * lonScale);
            const y = p.height/2 - (latDiff * latScale); // Invert Y since lat increases northward
            
            // Size based on distance (closer = bigger)
            const size = p.map(1/flight.distance, 0, 1, 20, 60);
            
            // Only draw planes that are within the visible area (with some margin)
            const margin = 100; // pixels
            if (x > -margin && x < p.width + margin && y > -margin && y < p.height + margin) {
              // Draw the plane
              p.imageMode(p.CENTER);
              const img = flight.distance > 0 ? airplane : airplane;
              
              // Calculate rotation angle based on flight vector if available
              let rotation = 0;
              if (flight.vector) {
                const { latPerSecond, lonPerSecond } = flight.vector;
                
                // Only calculate rotation if vector has meaningful values
                if (Math.abs(latPerSecond) > 0.00001 || Math.abs(lonPerSecond) > 0.00001) {
                  // Use atan2 with correct argument order and negate latitude for canvas coordinates
                  rotation = Math.atan2(-latPerSecond, lonPerSecond);
                  // Convert to degrees and adjust for p5's rotation system
                  rotation = p.degrees(rotation) - 90;
                  
                  // Draw a line showing the direction vector (for debugging)
                  p.push();
                  p.translate(x, y);
                  p.stroke(255, 255, 0, 200);
                  p.strokeWeight(2);
                  const vectorScale = 50; // Scale the vector for visibility
                  p.line(0, 0, lonPerSecond * vectorScale, -latPerSecond * vectorScale);
                  p.pop();
                }
              }
              
              // Apply rotation
              p.push();
              p.translate(x, y);
              p.rotate(rotation);
              
              // Only draw the image if it's loaded
              if (img && img.width > 0) {
                p.image(img, 0, 0, size, size);
              }
              p.pop();
              
              // Optionally, draw the distance to the flight
              p.fill('#5C7285');
              p.noStroke();
              p.textSize(12);
              p.text(`${Math.round(flight.distance)} mi`, x, y - size/2 - 10);
            }
          });
        }

        // Draw edits as shrinking circles
        const currentEdits = editsRef.current;
        currentEdits.forEach(edit => {
          // Calculate size based on edit size and age
          const maxSize = edit.size;
          const currentSize = maxSize * (1 - edit.age / 60); // Shrink over 30 seconds
          
          // Use the pre-calculated position
          const x = edit.position.x;
          const y = edit.position.y;
           
          // Draw ripple effect with proper alpha transparency
          for (let i = 3; i >= 0; i--) {
            const rippleSize = currentSize * (1 + i * 0.3);
            const alpha = p.map(i, 0, 3, 200, 25); // Map to 0-255 alpha values
            p.noFill();
            p.stroke(77, 108, 129, alpha); // #4d6c81 with alpha
            p.strokeWeight(2);
            p.ellipse(x, y, rippleSize, rippleSize);
          }
          
          // Draw main circle
          p.fill('#4d6c81');
          p.noStroke();
          p.ellipse(x, y, 10, 10);//currentSize, currentSize);
          
          // Draw title for larger edits
          if (edit.size > 30 && edit.age < 20) {
            p.textSize(15);
            p.textAlign(p.CENTER, p.CENTER);
            // Truncate long titles
            const displayTitle = edit.title.length > 25 
              ? edit.title.substring(0, 22) + '...' 
              : edit.title;
            
            // Draw the title with a different color to indicate it's clickable
            p.fill('#5C7285');
            p.text(displayTitle, x, y + currentSize);
            
            // Draw a subtle underline to indicate it's a link
            const textWidth = p.textWidth(displayTitle);
            p.stroke('#5C7285');
            p.strokeWeight(1);
            p.line(x - textWidth/2, y + currentSize + 8, x + textWidth/2, y + currentSize + 8);
          }
        });
        
        // Draw wiki waveform if analyzer is available
        if (wikiAnalyzer) {
          const data = wikiAnalyzer.getValue() as Float32Array;
          p.stroke('#4d6c81');
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

        // Update mouseClicked handler to handle both flights and wiki edits
        p.mouseClicked = () => {
          // Check if click is on any flight callsign or plane
          if (flights && flights.length > 0) {
            for (const flight of flights) {
              if (flight.callsign) {
                // Calculate position using the same logic as in draw()
                const latDiff = flight.lat - myLat;
                const lonDiff = flight.lon - myLon;
                const latScale = p.height * 3;
                const lonScale = p.width * 3;
                const x = p.width/2 + (lonDiff * lonScale);
                const y = p.height/2 - (latDiff * latScale);
                const size = p.map(1/flight.distance, 0, 1, 20, 60);
                
                // Check if mouse is near the plane
                if (p.dist(p.mouseX, p.mouseY, x, y) < size/2) {
                  // Open the ADSB database page in a new tab
                  window.open(`https://api.adsbdb.com/v0/callsign/${flight.callsign}`, '_blank');
                  return false; // Prevent default behavior
                }
              }
            }
          }
          
          // Check if click is on any edit title
          const currentEdits = editsRef.current;
          for (const edit of currentEdits) {
            const x = edit.position.x;
            const y = edit.position.y;
            
            // Check if mouse is near the circle
            if (p.dist(p.mouseX, p.mouseY, x, y) < 20) {
              // Open the Wikipedia page in a new tab
              if (edit.url) {
                window.open(edit.url, '_blank');
                return false; // Prevent default behavior
              }
            }
          }
          
          return true;
        };
      };
      
      p.windowResized = () => {
        if (containerRef.current) {
          p.resizeCanvas(
            containerRef.current.clientWidth,
            containerRef.current.clientWidth,
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
  }, [weatherAnalyzer, flights, flightAnalyzer, myLat, myLon, wikiAnalyzer, backgroundColor]);

  return (
    <div className="w-full mb-4">
      <h4 className="mb-2 text-sm font-medium"></h4>
      <div ref={containerRef} className="w-full max-w-lg mx-auto rounded-lg overflow-hidden" />
    </div>
  );
};

export default Visualizer; 