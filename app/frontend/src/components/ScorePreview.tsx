import type { ScoreDraft } from '../types';
import { JianpuPreview } from './JianpuPreview';
import { StaffPreview } from './StaffPreview';

type ScorePreviewProps = {
  score: ScoreDraft;
};

export function ScorePreview({ score }: ScorePreviewProps) {
  return (
    <section className="card score-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">识别结果</p>
          <h2>{score.title}</h2>
        </div>
        <div className="pill">{score.notes.length} notes</div>
      </div>

      <h3>五线谱预览</h3>
      <StaffPreview score={score} />

      <h3>简谱预览</h3>
      <JianpuPreview score={score} />
    </section>
  );
}
