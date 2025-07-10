# Streamscapes

**Real-time data streams turned into sound**

Streamscapes is an interactive web application that transforms live data streams into generative music and visualizations. It creates an ambient soundscape by sonifying real-time weather data, flight information, and Wikipedia edits happening around your location.

## 🎵 Features

### Multi-Stream Sonification
- **Weather Synth**: Converts local weather conditions into musical patterns
  - Temperature affects arpeggio patterns (cold = minor, warm = major)
  - Cloud cover generates atmospheric noise
  - Uses your actual GPS location for real-time weather data

- **Flight Synth**: Sonifies aircraft in your vicinity
  - Maps flight distance to frequency (closer = higher pitch)
  - Flight speed affects sound characteristics
  - Real-time tracking of commercial aircraft

- **Wikipedia Synth**: Transforms Wikipedia edits into musical events
  - Edit size determines note velocity
  - Title length maps to musical scale notes
  - Filters distinguish between user edits and bot activity
    
### Visualizations
- **Flight Radar**: Real-time map showing aircraft positions relative to your location
- **Distance Rings**: Visual indicators for 1, 5, and 10-mile radius around your position
- **Wikipedia Activity**: Animated particles representing recent Wikipedia edits
- **Audio Waveforms**: Real-time visualization of the generated audio


### Interactivity

- **Start the Synth**: Click the "Start Synth" button to initialize audio
- **Choose a Scale**: Select your preferred musical scale from the dropdown
- **Adjust Mix**: Use the volume sliders to balance the three data streams
   
## 🛠️ Technology Stack

- **Frontend**: Next.js, React, TypeScript
- **Audio**: Tone.js, Tonal.js
- **Visualization**: P5.js for real-time graphics
- **Styling**: Tailwind CSS
- **APIs**: 
  - OpenWeatherMap API (weather data)
  - Flightradar24 API (flight tracking)
  - Wikimedia EventStream (Wikipedia edits)

