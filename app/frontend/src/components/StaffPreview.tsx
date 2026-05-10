import type { ScoreDraft } from '../types';

type StaffPreviewProps = {
  score: ScoreDraft;
};

function midiToY(midi: number): number {
  return 118 - (midi - 60) * 4.8;
}

export function StaffPreview({ score }: StaffPreviewProps) {
  const width = Math.max(620, score.notes.length * 72 + 80);
  const lineStart = 40;
  const lineEnd = width - 32;
  const staffLines = [70, 82, 94, 106, 118];

  return (
    <div className="staff-scroll">
      <svg width={width} height="170" role="img" aria-label="五线谱预览">
        {staffLines.map((y) => (
          <line key={y} x1={lineStart} y1={y} x2={lineEnd} y2={y} className="staff-line" />
        ))}
        {[0, 4, 8].map((beat) => {
          const x = lineStart + beat * 62;
          return <line key={beat} x1={x} y1="66" x2={x} y2="122" className="bar-line" />;
        })}
        <text x="12" y="102" className="clef">𝄞</text>
        {score.notes.map((note) => {
          const x = lineStart + note.startBeat * 62 + 30;
          const y = midiToY(note.midi);
          const lowConfidence = note.confidence && note.confidence < 0.92;
          return (
            <g key={note.id}>
              <ellipse cx={x} cy={y} rx="10" ry="7" className={lowConfidence ? 'note low' : 'note'} />
              <line x1={x + 9} y1={y} x2={x + 9} y2={y - 34} className="stem" />
              <text x={x - 12} y="148" className="note-label">{note.pitch}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
