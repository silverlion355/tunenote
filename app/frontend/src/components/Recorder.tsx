import { useRef, useState } from 'react';

type RecorderProps = {
  onAudioReady: (blob: Blob, filename: string) => void;
};

export function Recorder({ onAudioReady }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function startRecording() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录音，请改用音频上传。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        onAudioReady(blob, 'recording.webm');
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError('无法访问麦克风，请检查浏览器权限。');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }

  return (
    <div className="recorder">
      <button onClick={isRecording ? stopRecording : startRecording} className={isRecording ? 'danger' : ''}>
        {isRecording ? '停止录音' : '开始录音'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
