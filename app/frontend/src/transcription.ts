import { logger, logPitchDetected, logNoteSegment } from './logger';
import type { NoteEvent } from './types';

export type TranscriptionResult = {
  notes: NoteEvent[];
  tempo: number;
  key: string;
};

function midiToPitch(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[Math.round(midi) % 12];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${noteName}${octave}`;
}

function frequencyToMidi(f: number): number {
  if (f <= 0) return 0;
  return 12 * Math.log2(f / 440) + 69;
}

// Harmonic Product Spectrum for fundamental frequency detection
function detectPitchHPS(spectrum: Float32Array, sampleRate: number, frameSize: number): number | null {
  const minFreq = 80;
  const maxFreq = 1000;

  const minBin = Math.floor(minFreq * frameSize / sampleRate);
  const maxBin = Math.floor(maxFreq * frameSize / sampleRate);

  // Harmonic Product Spectrum
  const hpsLength = maxBin - minBin + 1;
  const hps = new Float32Array(hpsLength);

  for (let i = 0; i < hpsLength; i++) {
    hps[i] = Math.abs(spectrum[minBin + i]);
  }

  // Downsample harmonics
  for (let h = 2; h <= 5; h++) {
    for (let i = 0; i < hpsLength; i++) {
      const bin = minBin + Math.floor(i * h);
      if (bin < minBin + spectrum.length) {
        hps[i] *= Math.abs(spectrum[bin]);
      }
    }
  }

  // Find peak in HPS
  let maxVal = 0;
  let maxIdx = 0;
  for (let i = 0; i < hpsLength; i++) {
    if (hps[i] > maxVal) {
      maxVal = hps[i];
      maxIdx = i;
    }
  }

  if (maxVal < 0.01) return null;

  // Parabolic interpolation for better accuracy
  const x1 = maxIdx > 0 ? hps[maxIdx - 1] : 0;
  const x2 = hps[maxIdx];
  const x3 = maxIdx < hpsLength - 1 ? hps[maxIdx + 1] : 0;

  const delta = 0.5 * (x1 - x3) / (x1 - 2 * x2 + x3);
  const peakBin = minBin + maxIdx + delta;

  return peakBin * sampleRate / frameSize;
}

// Autocorrelation with envelope normalization
function detectPitchAutocorr(frame: Float32Array, sampleRate: number): number | null {
  const n = frame.length;
  const minPeriod = Math.floor(sampleRate / 1000);
  const maxPeriod = Math.floor(sampleRate / 60);

  const ac = new Float32Array(maxPeriod);
  for (let lag = minPeriod; lag < maxPeriod; lag++) {
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += frame[i] * frame[i + lag];
      norm += frame[i] * frame[i] + frame[i + lag] * frame[i + lag];
    }
    ac[lag - minPeriod] = sum / (norm / 2 + 0.0001);
  }

  // Find first peak after minimum period
  let maxVal = 0;
  let maxIdx = 0;
  for (let i = 10; i < ac.length - 1; i++) {
    if (ac[i] > ac[i - 1] && ac[i] > ac[i + 1] && ac[i] > maxVal) {
      maxVal = ac[i];
      maxIdx = i;
    }
  }

  if (maxVal < 0.2) return null;

  // Parabolic interpolation
  const y1 = ac[maxIdx - 1] || 0;
  const y2 = ac[maxIdx];
  const y3 = ac[maxIdx + 1] || 0;
  const delta = 0.5 * (y1 - y3) / (y1 - 2 * y2 + y3);

  return sampleRate / (minPeriod + maxIdx + delta);
}

// Combined pitch detection
function detectPitch(frame: Float32Array, sampleRate: number): { freq: number; confidence: number } | null {
  // Compute spectrum for HPS
  const spectrum = new Float32Array(frame.length);
  for (let k = 0; k < frame.length; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < frame.length; n++) {
      const angle = -2 * Math.PI * k * n / frame.length;
      re += frame[n] * Math.cos(angle);
      im += frame[n] * Math.sin(angle);
    }
    spectrum[k] = Math.sqrt(re * re + im * im) / frame.length;
  }

  const hpsFreq = detectPitchHPS(spectrum, sampleRate, frame.length);
  const acFreq = detectPitchAutocorr(frame, sampleRate);

  if (hpsFreq && hpsFreq >= 60 && hpsFreq <= 1200) {
    return { freq: hpsFreq, confidence: 0.7 };
  }

  if (acFreq && acFreq >= 60 && acFreq <= 1200) {
    return { freq: acFreq, confidence: 0.5 };
  }

  return null;
}

// Calculate RMS energy
function rmsEnergy(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
}

// Low-pass filter
function lowPassFilter(frame: Float32Array, alpha: number = 0.95): Float32Array {
  const filtered = new Float32Array(frame.length);
  let prev = 0;
  for (let i = 0; i < frame.length; i++) {
    filtered[i] = alpha * frame[i] + (1 - alpha) * prev;
    prev = filtered[i];
  }
  return filtered;
}

export async function transcribeAudio(
  audioBuffer: AudioBuffer,
  options: {
    minConfidence?: number;
    minDuration?: number;
    useServer?: boolean;
  } = {},
): Promise<TranscriptionResult> {
  const {
    minConfidence = 0.15,
    minDuration = 0.08,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  const frameSize = Math.floor(sampleRate * 0.046);
  const hopSize = Math.floor(sampleRate * 0.01);

  logger.info('Transcription', `开始分析音频: 采样率=${sampleRate}Hz, 帧大小=${frameSize}, 跳步=${hopSize}`);

  const rawPitches: { time: number; freq: number; midi: number; energy: number; confidence: number }[] = [];
  let frameCount = 0;
  let pitchDetectedCount = 0;

  for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
    frameCount++;
    const frame = new Float32Array(frameSize);
    for (let j = 0; j < frameSize; j++) {
      frame[j] = channelData[i + j];
    }

    const filtered = lowPassFilter(frame);
    const energy = rmsEnergy(filtered);

    if (energy < 0.002) continue;

    const pitchResult = detectPitch(filtered, sampleRate);
    if (!pitchResult) continue;

    pitchDetectedCount++;
    const midi = frequencyToMidi(pitchResult.freq);
    rawPitches.push({
      time: i / sampleRate,
      freq: pitchResult.freq,
      midi,
      energy,
      confidence: pitchResult.confidence,
    });

    // Log every 10th detection for debugging
    if (pitchDetectedCount % 10 === 0) {
      logPitchDetected(Math.round(midi), pitchResult.freq, i / sampleRate);
    }
  }

  logger.info('Transcription', `帧分析完成: 共${frameCount}帧, 检测到${pitchDetectedCount}个音高`);

  if (rawPitches.length === 0) {
    logger.warn('Transcription', '未检测到任何音高');
    return { notes: [], tempo: 96, key: 'C' };
  }

  // Group pitches into note segments
  const segments: { start: number; end: number; midi: number; energy: number; count: number }[] = [];
  let currentSeg: (typeof segments)[0] | null = null;

  for (const pitch of rawPitches) {
    if (!currentSeg) {
      currentSeg = { start: pitch.time, end: pitch.time, midi: pitch.midi, energy: pitch.energy, count: 1 };
    } else if (Math.abs(Math.round(pitch.midi) - Math.round(currentSeg.midi)) <= 1 && pitch.time - currentSeg.end < 0.2) {
      currentSeg.end = pitch.time;
      currentSeg.midi = (currentSeg.midi * currentSeg.count + pitch.midi) / (currentSeg.count + 1);
      currentSeg.energy = (currentSeg.energy * currentSeg.count + pitch.energy) / (currentSeg.count + 1);
      currentSeg.count++;
    } else {
      if (currentSeg.count >= 3) {
        segments.push(currentSeg);
      }
      currentSeg = { start: pitch.time, end: pitch.time, midi: pitch.midi, energy: pitch.energy, count: 1 };
    }
  }

  if (currentSeg && currentSeg.count >= 3) {
    segments.push(currentSeg);
  }

  logger.info('Transcription', `音符分段完成: ${segments.length}个段落`);

  const validSegments = segments.filter(seg => seg.end - seg.start >= minDuration);

  if (validSegments.length === 0) {
    logger.warn('Transcription', '没有有效的音符段落');
    return { notes: [], tempo: 96, key: 'C' };
  }

  const bpm = 96;
  const beatSec = 60 / bpm;
  const notes: NoteEvent[] = [];

  for (const seg of validSegments) {
    const duration = seg.end - seg.start;

    let startBeat = seg.start / beatSec;
    let durationBeat = duration / beatSec;

    startBeat = Math.round(startBeat * 8) / 8;
    durationBeat = Math.max(0.25, Math.round(durationBeat * 4) / 4);

    const roundedMidi = Math.round(seg.midi);

    if (roundedMidi < 36 || roundedMidi > 84) continue;

    const confidence = Math.min(1, seg.energy * 2) * Math.min(1, seg.count / 5);

    if (confidence < minConfidence) continue;

    const note: NoteEvent = {
      id: `note-${notes.length + 1}`,
      midi: roundedMidi,
      pitch: midiToPitch(roundedMidi),
      startBeat,
      durationBeat,
      velocity: 75 + Math.round(confidence * 20),
      confidence,
    };

    notes.push(note);
    logNoteSegment(startBeat, roundedMidi, durationBeat);
  }

  notes.sort((a, b) => a.startBeat - b.startBeat);

  // Merge very close notes
  const mergedNotes: NoteEvent[] = [];
  for (const note of notes) {
    const last = mergedNotes[mergedNotes.length - 1];
    if (last && last.midi === note.midi && note.startBeat - (last.startBeat + last.durationBeat) < 0.25) {
      last.durationBeat = note.startBeat + note.durationBeat - last.startBeat;
    } else {
      mergedNotes.push({ ...note });
    }
  }

  logger.info('Transcription', `最终音符数量: ${mergedNotes.length}`);

  return { notes: mergedNotes, tempo: bpm, key: 'C' };
}

export function audioBufferFromBlob(blob: Blob): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const audioContext = new AudioContext();
        const buffer = await audioContext.decodeAudioData(reader.result as ArrayBuffer);
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}