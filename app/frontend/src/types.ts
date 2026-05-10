export type NoteEvent = {
  id: string;
  midi: number;
  pitch: string;
  startBeat: number;
  durationBeat: number;
  velocity?: number;
  confidence?: number;
};

export type ScoreDraft = {
  id: string;
  title: string;
  tempo: number;
  timeSignature: string;
  key: string;
  notes: NoteEvent[];
};

export type TranscriptionResponse = {
  score: ScoreDraft;
  warnings: string[];
};
