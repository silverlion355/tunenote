import { ChangeEvent, useEffect, useState } from 'react';
import { transcribeAudio, audioBufferFromBlob } from './transcription';
import { playScore } from './audio';
import { Recorder } from './components/Recorder';
import { ScorePreview } from './components/ScorePreview';
import { LogViewer } from './components/LogViewer';
import { logger, logAudioLoaded, logTranscriptionStart, logTranscriptionStep, logTranscriptionComplete, logTranscriptionError, logPlaybackStart, logAppError } from './logger';
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
    logger.info('Audio', `用户选择文件: ${file.name}`, { size: file.size, type: file.type });
  }

  function handleAudioReady(blob: Blob, filename: string) {
    setAudioBlob(blob);
    setAudioName(filename);
    setScore(null);
    setError(null);
    logger.info('Audio', `录音完成: ${filename}`, { size: blob.size });
  }

  const [progress, setProgress] = useState('');

  async function handleTranscribe() {
    if (!audioBlob) {
      setError('请先录音或上传一段音频。');
      logger.warn('Transcription', '尝试识别但没有音频');
      return;
    }

    setIsLoading(true);
    setError(null);
    logTranscriptionStart();

    try {
      setProgress('正在解码音频...');
      logTranscriptionStep('解码音频');
      const audioBuffer = await audioBufferFromBlob(audioBlob);
      logAudioLoaded(audioName || 'recording', audioBlob.size, audioBuffer.duration);

      setProgress('正在分析旋律（HPS+自相关检测）...');
      logTranscriptionStep('HPS+自相关检测');
      const result = await transcribeAudio(audioBuffer, { minDuration: 0.1, minConfidence: 0.25 });

      setProgress('正在生成乐谱...');
      logTranscriptionStep('生成乐谱');

      const newScore: ScoreDraft = {
        id: 'realtime_' + Date.now(),
        title: audioName || 'Recording',
        tempo: result.tempo,
        timeSignature: '4/4',
        key: result.key,
        notes: result.notes,
      };

      setScore(newScore);
      logTranscriptionComplete(result.notes.length, result.tempo, result.key);

      if (result.notes.length === 0) {
        logger.warn('Transcription', '未检测到任何音符');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '识别失败，请稍后重试。';
      setError(message);
      logTranscriptionError(message);
      logAppError('transcribe', err as Error);
    } finally {
      setIsLoading(false);
      setProgress('');
    }
  }

  function handlePlayScore() {
    if (score) {
      logPlaybackStart(score.notes.length);
      playScore(score);
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
          <button onClick={handlePlayScore} disabled={!score} className="secondary">
            播放生成旋律
          </button>
        </div>

        {isLoading && (
          <p className="loading-hint">{progress || '识别中...'}</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {score && <ScorePreview score={score} />}

      <LogViewer />
    </main>
  );
}

export default App;