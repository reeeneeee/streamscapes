import Foundation

/// Computes MIDI note arrays from a root note name and scale name.
/// Port of web's `@tonaljs/scale` logic — interval-based scale generation
/// spanning 3 octaves from the root.
enum MusicScale {
    // Semitone intervals from root for each scale type
    static let scaleIntervals: [String: [Int]] = [
        "major pentatonic": [0, 2, 4, 7, 9],
        "minor pentatonic": [0, 3, 5, 7, 10],
        "major": [0, 2, 4, 5, 7, 9, 11],
        "minor": [0, 2, 3, 5, 7, 8, 10],
        "blues": [0, 3, 5, 6, 7, 10],
        "chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        "dorian": [0, 2, 3, 5, 7, 9, 10],
        "mixolydian": [0, 2, 4, 5, 7, 9, 10],
        "lydian": [0, 2, 4, 6, 7, 9, 11],
        "phrygian": [0, 1, 3, 5, 7, 8, 10],
        "whole tone": [0, 2, 4, 6, 8, 10],
        "diminished": [0, 2, 3, 5, 6, 8, 9, 11],
    ]

    private static let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private static let flatToSharp = ["Db": "C#", "Eb": "D#", "Fb": "E", "Gb": "F#", "Ab": "G#", "Bb": "A#", "Cb": "B"]

    /// Parse a note name like "C4", "F#3", "Bb5" into a MIDI note number.
    static func parseMIDI(_ noteName: String) -> Int? {
        var name = noteName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }

        // Extract octave number from the end
        var octaveStr = ""
        while let last = name.last, last.isNumber || last == "-" {
            octaveStr = String(last) + octaveStr
            name.removeLast()
        }
        guard let octave = Int(octaveStr) else { return nil }
        guard !name.isEmpty else { return nil }

        // Normalize flats to sharps
        if let sharp = flatToSharp[name] {
            name = sharp
        }

        guard let noteIndex = noteNames.firstIndex(of: name) else { return nil }
        let midi = (octave + 1) * 12 + noteIndex
        guard midi >= 0 && midi <= 127 else { return nil }
        return midi
    }

    /// Convert MIDI note number to frequency in Hz (A4 = 440Hz).
    static func midiToFrequency(_ midi: Int) -> Double {
        440.0 * pow(2.0, Double(midi - 69) / 12.0)
    }

    /// Generate an array of MIDI note numbers spanning 3 octaves from the root.
    /// Returns notes across octaves: root-1, root, root+1 (3 octaves total).
    static func scaleNotes(rootNote: String, scale: String) -> [Int] {
        guard let rootMidi = parseMIDI(rootNote),
              let intervals = scaleIntervals[scale] else {
            // Fallback: C4 major pentatonic
            return scaleNotes(rootNote: "C4", scale: "major pentatonic")
        }

        var notes: [Int] = []
        // Generate across 3 octaves: one below root, root octave, one above
        for octaveOffset in [-12, 0, 12] {
            for interval in intervals {
                let midi = rootMidi + octaveOffset + interval
                if midi >= 0 && midi <= 127 {
                    notes.append(midi)
                }
            }
        }
        return notes.sorted()
    }

    /// Return only the root-octave notes (no octave spanning).
    /// Used by pattern mode to match web's `Scale.get().notes.slice(0, N)`.
    static func rootOctaveNotes(rootNote: String, scale: String) -> [Int] {
        guard let rootMidi = parseMIDI(rootNote),
              let intervals = scaleIntervals[scale] else {
            return rootOctaveNotes(rootNote: "C4", scale: "major pentatonic")
        }
        return intervals.map { rootMidi + $0 }.filter { $0 >= 0 && $0 <= 127 }
    }

    /// Given a normalized value (0-1), pick a note from the scale.
    /// This is the `scaleIndex` mapping target.
    static func noteForScaleIndex(_ normalizedIndex: Double, notes: [Int]) -> Int {
        guard !notes.isEmpty else { return 60 } // C4 fallback
        let clamped = max(0, min(1, normalizedIndex))
        let index = Int(clamped * Double(notes.count - 1))
        return notes[min(index, notes.count - 1)]
    }
}
