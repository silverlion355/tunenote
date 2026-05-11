import { useRef, useState, useEffect } from 'react';

type RecorderProps = {
  onAudioReady: (blob: Blob, filename: string) => void;
};

export function Recorder({ onAudioReady }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function requestMicrophone(): Promise<MediaStream | null> {
    if (permissionAsked && !streamRef.current) return null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;
      setPermissionAsked(true);
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setPermissionAsked(true);
        return stream;
      } catch {
        return null;
      }
    }
  }

  async function startRecording() {
    setError(null);

    if (typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录音，请改用音频上传。');
      return;
    }

    const stream = await requestMicrophone();
    if (!stream) {
      setError('无法访问麦克风，请在浏览器设置中允许麦克风权限。');
      return;
    }

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onAudioReady(blob, 'recording.webm');
    };

    recorder.onerror = () => {
      setError('录音过程中发生错误，请重试。');
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setIsRecording(false);
    };

    recorderRef.current = recorder;
    recorder.start(100);
    setIsRecording(true);
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setIsRecording(false);
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="recorder">
      <button onClick={isRecording ? stopRecording : startRecording} className={isRecording ? 'danger' : ''}>
        {isRecording ? '停止录音' : '开始录音'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
