from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .transcription import transcribe_audio
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
    """Transcribe audio file to music notation using Basic Pitch."""
    # Read audio data
    audio_data = await audio.read()

    if len(audio_data) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Check file size (max 50MB)
    if len(audio_data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 50MB)")

    try:
        score, warnings = transcribe_audio(
            audio_data,
            title=audio.filename or "Recorded Melody",
            tempo=tempo,
            time_signature=timeSignature,
            key=key,
        )

        return TranscriptionResponse(
            score=score,
            warnings=warnings,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
