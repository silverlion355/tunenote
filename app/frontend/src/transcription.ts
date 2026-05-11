import * as Pitchfinder from 'pitchfinder';
import type { NoteEvent } from './types';

const YIN = Pitchfinder.YIN;
const autoCorrelate = Pitchfinder.AMDF;

interface RawNote {
  time: number;
  midi: number;
  confidence: number;
  amplitude: number;
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

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function rmsAmplitude(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
}

function isHarmonic(frequency: number, baseFreq: number, tolerance = 0.02): boolean {
  if (baseFreq <= 0) return false;
  const ratio = frequency / baseFreq;
  const nearestHarmonic = Math.round(ratio);
  return Math.abs(ratio - nearestHarmonic) < tolerance;
}

function findFundamentalFreq(
  frame: Float32Array,
  sampleRate: number,
  detectPitch: (frame: Float32Array) => number | null,
  autoCorr: (frame: Float32Array) => number | null
): { freq: number; confidence: number } | null {
  const yinResult = detectPitch(frame);
  const amdfResult = autoCorr(frame);

  let freq: number | null = null;
  let confidence = 0;

  if (yinResult && yinResult >= 60 && yinResult <= 1200) {
    freq = yinResult;
    confidence = 0.9;
  } else if (amdfResult && amdfResult >= 60 && amdfResult <= 1200) {
    freq = amdfResult;
    confidence = 0.75;
  }

  if (!freq) return null;

  const baseFreq = freq;
  const harmonics = [2, 3, 4, 5, 6];

  let harmonicWeight = 0;
  for (const h of harmonics) {
    const harmonicFreq = baseFreq * h;
    const harmonyResult = detectPitch(frame);
    if (harmonyResult && isHarmonic(harmonicFreq, harmonyResult, 0.05)) {
      harmonicWeight += 0.1;
    }
    if (harmonyResult && isHarmonic(harmonyResult, baseFreq, 0.02)) {
      harmonicWeight += 0.15;
    }
  }

  if (harmonicWeight > 0.4) {
    const lowerPitch = detectPitch(frame);
    if (lowerPitch && lowerPitch < baseFreq * 0.6 && lowerPitch > 40) {
      return { freq: lowerPitch, confidence: 0.85 };
    }
  }

  return { freq, confidence: Math.min(1, confidence - harmonicWeight * 0.3) };
}

function detectSignificantPitch(
  frame: Float32Array,
  sampleRate: number,
  detectPitch: (frame: Float32Array) => number | null,
  autoCorr: (frame: Float32Array) => number | null
): { freq: number; confidence: number; amplitude: number } | null {
  const amplitude = rmsAmplitude(frame);
  const amplitudeThreshold = 0.01;

  if (amplitude < amplitudeThreshold) return null;

  const result = findFundamentalFreq(frame, sampleRate, detectPitch, autoCorr);
  if (!result) return null;

  const midi = frequencyToMidi(result.freq);
  const confidenceScore = result.confidence * (amplitude / (amplitude + 0.1));

  if (confidenceScore < 0.3) return null;

  return {
    freq: result.freq,
    confidence: confidenceScore,
    amplitude,
  };
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
    minConfidence = 0.4,
    minDuration = 0.1,
    frameSize = 4096,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  const detectPitch = YIN({ sampleRate, threshold: 0.10 });
  const autoCorr = autoCorrelate({ sampleRate });

  const hopSize = Math.floor(sampleRate * 0.02);
  const rawNotes: (RawNote & { freq: number })[] = [];

  const processedMidi: Set<string> = new Set();

  for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
    const frame = channelData.slice(i, i + frameSize);
    const time = i / sampleRate;

    const result = detectSignificantPitch(frame, sampleRate, detectPitch, autoCorr);
    if (!result) continue;

    const midi = frequencyToMidi(result.freq);

    rawNotes.push({
      time,
      midi,
      freq: result.freq,
      confidence: result.confidence,
      amplitude: result.amplitude,
    });
  }

  if (rawNotes.length === 0) {
    return { notes: [], tempo: 96 };
  }

  const rawNotesByTime = rawNotes.map(r => ({
    ...r,
    timeGroup: Math.floor(r.time / 0.5),
  }));

  const grouped: Map<number, { midi: number; amplitude: number; count: number; freq: number }> = new Map();

  for (const note of rawNotesByTime) {
    if (!grouped.has(note.timeGroup)) {
      grouped.set(note.timeGroup, { midi: 0, amplitude: 0, count: 0, freq: 0 });
    }
    const g = grouped.get(note.timeGroup)!;
    const weight = note.amplitude * note.confidence;
    g.midi += note.midi * weight;
    g.amplitude += note.amplitude * weight;
    g.count += 1;
    g.freq += note.freq * weight;
  }

  for (const [tg, g] of grouped) {
    if (g.count > 0) {
      g.midi /= g.amplitude;
      g.freq /= g.amplitude;
    }
  }

  const bpm = 96;
  const beatDuration = 60 / bpm;
  const notes: NoteEvent[] = [];
  const minGapBeats = 0.5;
  let lastEndBeat = -999;
  let octaveCount: Record<string, number> = {};

  for (const [timeGroup, group] of grouped) {
    if (group.count < 2) continue;

    const rawMidi = Math.round(group.midi);
    const baseMidi = rawMidi % 12;
    const isBlackKey = [1, 3, 6, 8, 10].includes(baseMidi);

    if (isBlackKey && group.amplitude < 0.05) continue;

    const timeKey = `${timeGroup}-${rawMidi}`;
    if (processedMidi.has(timeKey)) continue;
    processedMidi.add(timeKey);

    const startBeat = Math.round((timeGroup * 0.5) / beatDuration * 4) / 4;

    if (startBeat < lastEndBeat + minGapBeats) continue;

    const pitchName = midiToPitch(rawMidi);
    const baseNoteName = pitchName.replace(/[0-9-]/g, '');

    const isHighFreq = group.freq > 400;
    if (isHighFreq && octaveCount[baseNoteName] > 3) continue;
    octaveCount[baseNoteName] = (octaveCount[baseNoteName] || 0) + 1;

    const confidence = Math.min(1, group.count / 5);
    const effectiveConfidence = confidence * (group.amplitude / 0.3);

    if (effectiveConfidence < minConfidence) continue;

    const noteDuration = Math.max(0.25, Math.min(2, 4 / group.count));

    notes.push({
      id: `note-${notes.length + 1}`,
      midi: rawMidi,
      pitch: pitchName,
      startBeat,
      durationBeat: noteDuration,
      velocity: 80,
      confidence: effectiveConfidence,
    });

    lastEndBeat = startBeat + noteDuration;
  }

  notes.sort((a, b) => a.startBeat - b.startBeat);

  return { notes, tempo: bpm };
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