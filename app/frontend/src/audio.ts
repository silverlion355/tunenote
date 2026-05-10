import type { ScoreDraft } from './types';

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function playScore(score: ScoreDraft): void {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const startAt = context.currentTime + 0.08;
  const secondsPerBeat = 60 / score.tempo;

  for (const note of score.notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + note.startBeat * secondsPerBeat;
    const noteDuration = Math.max(0.08, note.durationBeat * secondsPerBeat * 0.9);

    oscillator.type = 'sine';
    oscillator.frequency.value = midiToFrequency(note.midi);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + noteDuration + 0.02);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
