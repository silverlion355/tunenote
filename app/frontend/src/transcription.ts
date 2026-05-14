import * as Pitchfinder from 'pitchfinder';
import type { NoteEvent } from './types';

const YIN = Pitchfinder.YIN;
const AMDF = Pitchfinder.AMDF;

interface RawNote {
  time: number;
  midi: number;
  confidence: number;
  amplitude: number;
}

function frequencyToMidi(frequency: number): number {
  if (frequency <= 0) return 0;
  return 12 * Math.log2(frequency / 440) + 69;
}

function midiToPitch(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[Math.round(midi) % 12];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${noteName}${octave}`;
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
  key: string;
};

function analyzeFrame(
  frame: Float32Array,
  sampleRate: number,
  yin: (f: Float32Array) => number | null,
  amdf: (f: Float32Array) => number | null,
): { midi: number; freq: number; amplitude: number; confidence: number } | null {
  const amplitude = rmsAmplitude(frame);
  if (amplitude < 0.005) return null; // 更低的阈值，更敏感

  // 尝试YIN，如果失败尝试AMDF
  let freq = yin(frame);
  if (!freq || freq < 50 || freq > 1500) {
    freq = amdf(frame);
  }
  if (!freq || freq < 50 || freq > 1500) return null;

  const midi = frequencyToMidi(freq);
  // 置信度基于振幅和YIN确定性
  const confidence = Math.min(1, amplitude * 3);
  if (confidence < 0.15) return null;

  return { midi, freq, amplitude, confidence };
}

export async function transcribeAudio(
  audioBuffer: AudioBuffer,
  options: {
    minConfidence?: number;
    minDuration?: number;
    frameSize?: number;
    minAmplitude?: number;
  } = {},
): Promise<TranscriptionResult> {
  const {
    minConfidence = 0.25,
    minDuration = 0.1,
    frameSize = 4096,
    minAmplitude = 0.005,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const yin = YIN({ sampleRate, threshold: 0.10 }); // 更低的阈值
  const amdf = AMDF({ sampleRate, minFrequency: 50, maxFrequency: 1500 });

  // 25ms 跳步 - 更密集的分析
  const hopSize = Math.floor(sampleRate * 0.025);
  const rawNotes: RawNote[] = [];

  for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
    const frame = channelData.slice(i, i + frameSize);
    const result = analyzeFrame(frame, sampleRate, yin, amdf);
    if (!result) continue;

    rawNotes.push({
      time: i / sampleRate,
      midi: result.midi,
      amplitude: result.amplitude,
      confidence: result.confidence,
    });
  }

  if (rawNotes.length === 0) {
    return { notes: [], tempo: 96, key: 'C' };
  }

  // === 步骤1：按时间分组，合并相邻检测 ===
  const timeResolution = 0.1; // 100ms时间窗口
  const grouped: Map<number, { midi: number; amplitude: number; count: number }> = new Map();

  for (const note of rawNotes) {
    const timeGroup = Math.round(note.time / timeResolution);
    if (!grouped.has(timeGroup)) {
      grouped.set(timeGroup, { midi: 0, amplitude: 0, count: 0 });
    }
    const g = grouped.get(timeGroup)!;
    const weight = note.amplitude * note.confidence;
    g.midi += note.midi * weight;
    g.amplitude += weight;
    g.count += 1;
  }

  for (const g of grouped.values()) {
    if (g.amplitude > 0) {
      g.midi /= g.amplitude;
    }
  }

  // === 步骤2：合并连续的相同音高片段 ===
  const segments: { startTime: number; endTime: number; midi: number; avgAmplitude: number; count: number }[] = [];
  let currentSegment: typeof segments[0] | null = null;

  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

  for (const [timeKey, group] of sortedGroups) {
    const time = timeKey * timeResolution;
    const roundedMidi = Math.round(group.midi);

    if (!currentSegment) {
      currentSegment = { startTime: time, endTime: time, midi: roundedMidi, avgAmplitude: group.amplitude, count: group.count };
    } else if (Math.abs(roundedMidi - currentSegment.midi) <= 1 && time - currentSegment.endTime < 0.25) {
      // 继续当前片段
      currentSegment.endTime = time;
      currentSegment.avgAmplitude = (currentSegment.avgAmplitude * currentSegment.count + group.amplitude) / (currentSegment.count + 1);
      currentSegment.count += group.count;
    } else {
      // 保存当前片段，开始新片段
      segments.push(currentSegment);
      currentSegment = { startTime: time, endTime: time, midi: roundedMidi, avgAmplitude: group.amplitude, count: group.count };
    }
  }
  if (currentSegment) {
    segments.push(currentSegment);
  }

  // === 步骤3：量化到节拍网格 ===
  const bpm = 96;
  const beatDuration = 60 / bpm;
  const notes: NoteEvent[] = [];
  let lastEndBeat = -999;

  for (const seg of segments) {
    const startBeat = Math.round((seg.startTime) / beatDuration * 4) / 4;
    const endBeat = Math.round((seg.endTime) / beatDuration * 4) / 4;
    const durationBeat = Math.max(0.25, endBeat - startBeat);

    // 跳过与上一个音符重叠的
    if (startBeat < lastEndBeat) continue;

    const rawMidi = seg.midi;
    const pitchName = midiToPitch(rawMidi);
    const effectiveConfidence = Math.min(1, seg.count / 5) * Math.min(1, seg.avgAmplitude * 2);

    if (effectiveConfidence < minConfidence) continue;

    notes.push({
      id: `note-${notes.length + 1}`,
      midi: rawMidi,
      pitch: pitchName,
      startBeat,
      durationBeat,
      velocity: 80,
      confidence: effectiveConfidence,
    });

    lastEndBeat = startBeat + durationBeat;
  }

  notes.sort((a, b) => a.startBeat - b.startBeat);

  // === 步骤4：简单调性估计 ===
  const key = 'C'; // 简化版，后续可以添加调性检测

  return { notes, tempo: bpm, key };
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