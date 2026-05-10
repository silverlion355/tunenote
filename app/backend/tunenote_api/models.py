from pydantic import BaseModel, Field


class NoteEvent(BaseModel):
    id: str
    midi: int
    pitch: str
    startBeat: float
    durationBeat: float
    velocity: int | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class ScoreDraft(BaseModel):
    id: str
    title: str
    tempo: int
    timeSignature: str
    key: str
    notes: list[NoteEvent]


class TranscriptionResponse(BaseModel):
    score: ScoreDraft
    warnings: list[str] = []
