from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .mock_transcription import create_mock_score
from .models import TranscriptionResponse

app = FastAPI(title="TuneNote API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tunenote-api"}


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    audio: UploadFile = File(...),
    tempo: int = Form(96),
    timeSignature: str = Form("4/4"),
    key: str = Form("C"),
) -> TranscriptionResponse:
    await audio.read()
    score = create_mock_score(
        title=audio.filename or "Mock Melody",
        tempo=tempo,
        time_signature=timeSignature,
        key=key,
    )
    return TranscriptionResponse(
        score=score,
        warnings=["This MVP currently returns a mock melody; real audio transcription is not connected yet."],
    )
