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

export type TranscriptionResult = {
  notes: NoteEvent[];
  tempo: number;
};

function analyzeFrame(
  frame: Float32Array,
  sampleRate: number,
  detectPitch: (frame: Float32Array) => number | null
): { midi: number; freq: number; amplitude: number; confidence: number } | null {
  const amplitude = rmsAmplitude(frame);
  if (amplitude < 0.01) return null;

  const freq = detectPitch(frame);
  if (!freq || freq < 60 || freq > 1200) return null;

  const midi = frequencyToMidi(freq);
  const confidence = Math.min(1, amplitude * 2);
  if (confidence < 0.2) return null;

  return { midi, freq, amplitude, confidence };
}

export async function transcribeAudio(
  audioBuffer: AudioBuffer,
  options: {
    minConfidence?: number;
    minDuration?: number;
    frameSize?: number;
  } = {},
): Promise<TranscriptionResult> {
  const {
    minConfidence = 0.35,
    minDuration = 0.15,
    frameSize = 2048,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const detectPitch = YIN({ sampleRate, threshold: 0.15 });

  // 更大的跳步减少处理量
  const hopSize = Math.floor(sampleRate * 0.05); // 50ms
  const rawNotes: { time: number; midi: number; freq: number; amplitude: number; confidence: number }[] = [];

  for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
    const frame = channelData.slice(i, i + frameSize);
    const result = analyzeFrame(frame, sampleRate, detectPitch);
    if (!result) continue;

    rawNotes.push({
      time: i / sampleRate,
      midi: result.midi,
      freq: result.freq,
      amplitude: result.amplitude,
      confidence: result.confidence,
    });
  }

  if (rawNotes.length === 0) {
    return { notes: [], tempo: 96 };
  }

  // 按时间分组（每0.4秒一组）
  const grouped: Map<number, { midi: number; amplitude: number; count: number; freq: number }> = new Map();

  for (const note of rawNotes) {
    const timeGroup = Math.floor(note.time / 0.4);
    if (!grouped.has(timeGroup)) {
      grouped.set(timeGroup, { midi: 0, amplitude: 0, count: 0, freq: 0 });
    }
    const g = grouped.get(timeGroup)!;
    const weight = note.amplitude * note.confidence;
    g.midi += note.midi * weight;
    g.amplitude += weight;
    g.count += 1;
    g.freq += note.freq * weight;
  }

  for (const g of grouped.values()) {
    if (g.amplitude > 0) {
      g.midi /= g.amplitude;
      g.freq /= g.amplitude;
    }
  }

  const bpm = 96;
  const beatDuration = 60 / bpm;
  const notes: NoteEvent[] = [];
  let lastEndBeat = -999;

  for (const [timeGroup, group] of grouped) {
    if (group.count < 2) continue;

    const rawMidi = Math.round(group.midi);
    const baseMidi = rawMidi % 12;
    // 过滤黑键（除非音量足够大）
    if ([1, 3, 6, 8, 10].includes(baseMidi) && group.amplitude < 0.1) continue;

    const startBeat = Math.round((timeGroup * 0.4) / beatDuration * 4) / 4;
    if (startBeat < lastEndBeat + 0.5) continue;

    const pitchName = midiToPitch(rawMidi);
    const effectiveConfidence = Math.min(1, group.count / 3) * (group.amplitude / 0.5);

    if (effectiveConfidence < minConfidence) continue;

    const noteDuration = Math.max(0.25, Math.min(1.5, 2 / group.count));

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