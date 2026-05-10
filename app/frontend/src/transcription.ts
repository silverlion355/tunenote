import * as Pitchfinder from 'pitchfinder';
import type { NoteEvent } from './types';

const YIN = Pitchfinder.YIN;
const autoCorrelate = Pitchfinder.AMDF;

interface RawNote {
  time: number;
  midi: number;
  confidence: number;
}

function frequencyToMidi(frequency: number): number {
  return 12 * Math.log2(frequency / 440) + 69;
}

function midiToPitch(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[Math.round(midi) % 12];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${noteName}${octave}`;
}

function quantizeToBeat(seconds: number, bpm: number): number {
  const beatDuration = 60 / bpm;
  return Math.round(seconds / beatDuration * 4) / 4;
}

export type TranscriptionResult = {
  notes: NoteEvent[];
  tempo: number;
};

export async function transcribeAudio(
  audioBuffer: AudioBuffer,
  options: {
    minConfidence?: number;
    minDuration?: number;
    frameSize?: number;
  } = {},
): Promise<TranscriptionResult> {
  const {
    minConfidence = 0.5,
    minDuration = 0.05,
    frameSize = 2048,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const detectPitch = YIN({ sampleRate, threshold: 0.15 });
  const autoCorr = autoCorrelate({ sampleRate });

  const hopSize = Math.floor(sampleRate * 0.05);
  const rawNotes: RawNote[] = [];

  for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
    const frame = channelData.slice(i, i + frameSize);
    const time = i / sampleRate;

    let frequency = detectPitch(frame);
    if (!frequency || frequency < 80 || frequency > 1200) {
      frequency = autoCorr(frame);
    }

    if (!frequency || frequency < 80 || frequency > 1200) continue;

    const midi = frequencyToMidi(frequency);
    const confidence = 1;
    rawNotes.push({ time, midi, confidence });
  }

  if (rawNotes.length === 0) {
    return { notes: [], tempo: 96 };
  }

  const notes: NoteEvent[] = [];
  let currentNote: RawNote | null = null;
  const minGapSeconds = minDuration;

  for (const note of rawNotes) {
    if (!currentNote) {
      currentNote = { ...note };
    } else {
      const midiDiff = Math.abs(note.midi - currentNote.midi);
      const timeGap = note.time - (currentNote.time + (currentNote.midi - 69) / 12 * 0.5);

      if (midiDiff < 1 && timeGap < minGapSeconds) {
        currentNote.time = (currentNote.time + note.time) / 2;
        currentNote.midi = (currentNote.midi + note.midi) / 2;
      } else {
        if (currentNote.confidence >= minConfidence) {
          const startBeat = quantizeToBeat(currentNote.time, 96);
          notes.push({
            id: `note-${notes.length + 1}`,
            midi: Math.round(currentNote.midi),
            pitch: midiToPitch(Math.round(currentNote.midi)),
            startBeat,
            durationBeat: 1,
            velocity: 88,
            confidence: currentNote.confidence,
          });
        }
        currentNote = { ...note };
      }
    }
  }

  if (currentNote && currentNote.confidence >= minConfidence) {
    const startBeat = quantizeToBeat(currentNote.time, 96);
    notes.push({
      id: `note-${notes.length + 1}`,
      midi: Math.round(currentNote.midi),
      pitch: midiToPitch(Math.round(currentNote.midi)),
      startBeat,
      durationBeat: 1,
      velocity: 88,
      confidence: currentNote.confidence,
    });
  }

  return { notes, tempo: 96 };
}

export function audioBufferFromBlob(blob: Blob): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const audioContext = new AudioContext();
        const arrayBuffer = reader.result as ArrayBuffer;
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}