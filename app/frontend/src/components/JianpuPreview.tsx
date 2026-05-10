import type { ScoreDraft } from '../types';

const pitchClassToNumber: Record<string, string> = {
  C: '1',
  D: '2',
  E: '3',
  F: '4',
  G: '5',
  A: '6',
  B: '7',
};

function toJianpu(pitch: string): string {
  const match = pitch.match(/^([A-G])(#|b)?(\d)$/);
  if (!match) return pitch;

  const [, letter, accidental = '', octaveText] = match;
  const octave = Number(octaveText);
  const base = pitchClassToNumber[letter] ?? pitch;
  const octaveMark = octave > 4 ? '·'.repeat(octave - 4) : octave < 4 ? '_'.repeat(4 - octave) : '';
  return `${accidental}${base}${octaveMark}`;
}

type JianpuPreviewProps = {
  score: ScoreDraft;
};

export function JianpuPreview({ score }: JianpuPreviewProps) {
  return (
    <div className="jianpu">
      <div className="score-meta">
        <span>调号：{score.key}</span>
        <span>拍号：{score.timeSignature}</span>
        <span>速度：{score.tempo} BPM</span>
      </div>
      <div className="jianpu-line">
        {score.notes.map((note, index) => (
          <span key={note.id} className={note.confidence && note.confidence < 0.92 ? 'low-confidence' : ''}>
            {index > 0 && note.startBeat % 4 === 0 ? '| ' : ''}
            {toJianpu(note.pitch)}
            {note.durationBeat > 1 ? ' -'.repeat(Math.round(note.durationBeat - 1)) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
