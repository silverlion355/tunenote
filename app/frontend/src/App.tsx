import { ChangeEvent, useEffect, useState } from 'react';
import { transcribeAudio, audioBufferFromBlob } from './transcription';
import { playScore } from './audio';
import { Recorder } from './components/Recorder';
import { ScorePreview } from './components/ScorePreview';
import type { ScoreDraft } from './types';

function App() {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    setAudioName(file.name);
    setScore(null);
    setError(null);
  }

  function handleAudioReady(blob: Blob, filename: string) {
    setAudioBlob(blob);
    setAudioName(filename);
    setScore(null);
    setError(null);
  }

  const [progress, setProgress] = useState('');

  async function handleTranscribe() {
    if (!audioBlob) {
      setError('请先录音或上传一段音频。');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgress('正在解码音频...');

    try {
      const audioBuffer = await audioBufferFromBlob(audioBlob);
      setProgress('正在分析旋律...');
      const result = await transcribeAudio(audioBuffer, { minDuration: 0.15 });
      setProgress('正在生成乐谱...');
      setScore({
        id: 'realtime_' + Date.now(),
        title: audioName || 'Recording',
        tempo: result.tempo,
        timeSignature: '4/4',
        key: 'C',
        notes: result.notes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '识别失败，请稍后重试。');
    } finally {
      setIsLoading(false);
      setProgress('');
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">TuneNote</p>
        <h1>听曲写谱，从一段旋律开始</h1>
        <p className="hero-copy">
          录制或上传一段旋律，实时提取主旋律，生成五线谱与简谱。
        </p>
      </section>

      <section className="card controls-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>输入音频</h2>
          </div>
        </div>

        <div className="control-grid">
          <label className="upload-box">
            <span>上传音频</span>
            <small>支持 wav / mp3 / m4a / webm</small>
            <input type="file" accept="audio/*" onChange={handleFileChange} />
          </label>
          <Recorder onAudioReady={handleAudioReady} />
        </div>

        {audioUrl && (
          <div className="audio-preview">
            <strong>{audioName || 'recording.webm'}</strong>
            <audio src={audioUrl} controls />
          </div>
        )}

        <div className="actions">
          <button onClick={handleTranscribe} disabled={isLoading || !audioBlob}>
            {isLoading ? '识别中…' : '开始识别'}
          </button>
          <button onClick={() => score && playScore(score)} disabled={!score} className="secondary">
            播放生成旋律
          </button>
        </div>

        {isLoading && (
          <p className="loading-hint">{progress || '识别中...'}</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {score && <ScorePreview score={score} />}
    </main>
  );
}

export default App;