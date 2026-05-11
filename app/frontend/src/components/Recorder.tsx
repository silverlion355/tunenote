import { useState, useRef } from 'react';

type RecorderProps = {
  onAudioReady: (blob: Blob, filename: string) => void;
};

export function Recorder({ onAudioReady }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('点击开始录音');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    setError(null);
    chunksRef.current = [];

    if (typeof MediaRecorder === 'undefined') {
      setError('当前设备不支持录音，请使用音频上传功能。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: 44100,
        } as MediaTrackConstraints,
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onAudioReady(blob, `recording.${getExtension(mimeType)}`);
        setIsRecording(false);
        setStatus('点击开始录音');
      };

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setError('录音过程发生错误，请重试。');
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsRecording(true);
      setStatus('录音中...');
    } catch (err: any) {
      const message = err?.message || '';
      if (message.includes('Permission') || message.includes('denied') || message.includes('NotAllowed')) {
        setError(
          '麦克风权限被拒绝。\n\n' +
          '请在浏览器设置中允许麦克风权限，或尝试以下方法：\n' +
          '1. 在手机「设置」→「应用」中找到 TuneNote\n' +
          '2. 进入「权限」→ 允许「麦克风」\n' +
          '3. 如果使用 Chrome，检查地址栏左侧的麦克风图标并点击允许\n\n' +
          '或者使用「上传音频」功能代替录音'
        );
      } else {
        setError(`无法启动录音: ${message || '未知错误'}`);
      }
      setStatus('点击开始录音');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setStatus('停止中...');
  }

  return (
    <div className="recorder">
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={isRecording ? 'danger' : ''}
      >
        {isRecording ? '停止录音' : '开始录音'}
      </button>
      <span className="recorder-status" style={{ marginLeft: '12px', color: '#666' }}>{status}</span>
      {error && (
        <p className="error" style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>{error}</p>
      )}
    </div>
  );
}

function getExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}