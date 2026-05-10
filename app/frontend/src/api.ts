import type { TranscriptionResponse } from './types';

export async function transcribeAudio(file: Blob, filename = 'recording.webm'): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append('audio', file, filename);
  formData.append('tempo', '96');
  formData.append('timeSignature', '4/4');
  formData.append('key', 'C');

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`);
  }

  return response.json();
}
