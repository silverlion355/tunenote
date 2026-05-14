"""
Real audio transcription using Basic Pitch and librosa.
This module replaces the mock transcription with actual melody extraction.
"""
import io
import numpy as np
import librosa
import soundfile as sf
from basic_pitch.inference import predict_and_save
from basic_pitch import note_creation
import tempfile
import os

from .models import NoteEvent, ScoreDraft


def convert_to_wav(audio_data: bytes) -> np.ndarray:
    """Convert audio bytes to WAV format and return as numpy array."""
    try:
        # Try loading directly with soundfile
        audio, sr = sf.read(io.BytesIO(audio_data))
    except Exception:
        try:
            # Fall back to librosa
            audio, sr = librosa.load(io.BytesIO(audio_data), sr=None, mono=True)
        except Exception as e:
            raise ValueError(f"Could not decode audio file: {e}")

    # Convert to mono if stereo
    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)

    # Resample to 22050 Hz for Basic Pitch (optimal for the model)
    if sr != 22050:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=22050)
        sr = 22050

    return audio


def transcribe_audio(
    audio_data: bytes,
    *,
    title: str = "Recorded Melody",
    tempo: int = 96,
    time_signature: str = "4/4",
    key: str = "C",
) -> tuple[ScoreDraft, list[str]]:
    """
    Transcribe audio to score draft using Basic Pitch.

    Args:
        audio_data: Raw audio bytes
        title: Title for the score
        tempo: Override tempo (if 0, auto-detect)
        time_signature: Time signature
        key: Musical key

    Returns:
        tuple of (ScoreDraft, list of warnings)
    """
    warnings = []

    try:
        # Convert audio to proper format
        audio = convert_to_wav(audio_data)
        sample_rate = 22050

        # Save to temporary WAV file for Basic Pitch
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            wav_path = f.name
            sf.write(wav_path, audio, sample_rate)

        try:
            # Run Basic Pitch inference
            # Basic Pitch outputs JSON with note events
            _, midi_data, _ = predict_and_save(
                output_directory=tempfile.gettempdir(),
                audio_paths=[wav_path],
                save_midi=False,
                save_csv=False,
                save_figures=False,
                minimum_note_length=50,  # minimum note length in ms
                minimum_frequency=80,  # ~E2
                maximum_frequency=1200,  # ~D6
            )

            # Get the MIDI notes from Basic Pitch
            midi_path = os.path.join(tempfile.gettempdir(), os.path.basename(wav_path).replace('.wav', '_basic_pitch.mid'))

            if os.path.exists(midi_path):
                import pretty_midi
                midi = pretty_midi.PrettyMIDI(midi_path)
                notes = _midi_to_notes(midi, tempo)
                os.remove(midi_path)
            else:
                # Fallback: use the returned note data directly
                notes = _parse_basic_pitch_output(midi_data, audio, sample_rate, tempo)

        finally:
            # Clean up temp file
            if os.path.exists(wav_path):
                os.remove(wav_path)

        if not notes:
            warnings.append("No notes detected in audio. The recording may be too quiet or contain no clear melody.")
            # Return empty score
            score = ScoreDraft(
                id=f"draft_{os.urandom(4).hex()}",
                title=title,
                tempo=tempo,
                timeSignature=time_signature,
                key=key,
                notes=[],
            )
            return score, warnings

        # Auto-detect tempo if requested
        if tempo == 0:
            detected_tempo = _detect_tempo(audio, sample_rate, notes)
            if detected_tempo:
                tempo = detected_tempo
                warnings.append(f"Auto-detected tempo: {tempo} BPM")

        # Estimate key from notes
        if key == "C":
            detected_key = _estimate_key(notes)
            if detected_key != "C":
                key = detected_key
                warnings.append(f"Estimated key: {key}")

        score = ScoreDraft(
            id=f"draft_{os.urandom(4).hex()}",
            title=title,
            tempo=tempo,
            timeSignature=time_signature,
            key=key,
            notes=notes,
        )

        return score, warnings

    except Exception as e:
        warnings.append(f"Transcription error: {str(e)}")
        # Return empty score on error
        score = ScoreDraft(
            id=f"draft_error_{os.urandom(4).hex()}",
            title=title,
            tempo=tempo,
            timeSignature=time_signature,
            key=key,
            notes=[],
        )
        return score, warnings


def _midi_to_notes(midi: 'pretty_midi.PrettyMIDI', default_tempo: int) -> list[NoteEvent]:
    """Convert PrettyMIDI object to NoteEvent list."""
    notes = []

    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for i, note in enumerate(instrument.notes):
            # Convert time to beats
            start_beat = note.start * default_tempo / 60.0
            duration_beat = (note.end - note.start) * default_tempo / 60.0

            # Quantize to nearest 0.25 beat
            start_beat = round(start_beat * 4) / 4
            duration_beat = max(0.25, round(duration_beat * 4) / 4)

            notes.append(NoteEvent(
                id=f"note-{len(notes) + 1}",
                pitch=_midi_to_pitch(note.pitch),
                midi=note.pitch,
                startBeat=start_beat,
                durationBeat=duration_beat,
                velocity=note.velocity,
                confidence=0.9,  # Basic Pitch doesn't provide confidence per note
            ))

    # Sort by start time
    notes.sort(key=lambda n: n.startBeat)

    return notes


def _parse_basic_pitch_output(midi_data, audio, sr, tempo) -> list[NoteEvent]:
    """Parse Basic Pitch output when MIDI file not available."""
    notes = []

    # Basic Pitch returns note events as dictionaries
    if isinstance(midi_data, dict):
        for note_list in midi_data.values():
            if isinstance(note_list, list):
                for note in note_list:
                    if isinstance(note, dict) and 'note_start' in note:
                        start_sec = note.get('note_start', 0)
                        end_sec = note.get('note_end', start_sec + 0.5)
                        midi = note.get('note_midi', 60)
                        confidence = note.get('confidence', 0.5)

                        start_beat = start_sec * tempo / 60.0
                        duration_beat = (end_sec - start_sec) * tempo / 60.0

                        # Quantize
                        start_beat = round(start_beat * 4) / 4
                        duration_beat = max(0.25, round(duration_beat * 4) / 4)

                        notes.append(NoteEvent(
                            id=f"note-{len(notes) + 1}",
                            pitch=_midi_to_pitch(midi),
                            midi=midi,
                            startBeat=start_beat,
                            durationBeat=duration_beat,
                            velocity=80,
                            confidence=confidence,
                        ))

    return notes


def _detect_tempo(audio: np.ndarray, sr: int, notes: list[NoteEvent]) -> int:
    """Detect tempo from audio or note pattern."""
    try:
        # Use librosa beat tracking
        tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if len(tempo) > 0 else 96
        else:
            tempo = float(tempo)

        # Round to reasonable tempo
        if tempo < 60:
            tempo *= 2
        elif tempo > 200:
            tempo /= 2

        return int(round(tempo))
    except Exception:
        # Fallback: estimate from note intervals
        if len(notes) >= 2:
            intervals = [notes[i+1].startBeat - notes[i].startBeat for i in range(len(notes)-1)]
            avg_interval = sum(intervals) / len(intervals)
            if avg_interval > 0:
                tempo = int(round(60 / avg_interval))
                if 40 <= tempo <= 240:
                    return tempo

        return 96


def _estimate_key(notes: list[NoteEvent]) -> str:
    """Estimate musical key from note pitches."""
    if len(notes) < 4:
        return "C"

    # Count pitch classes
    pitch_classes = [n.midi % 12 for n in notes]

    # Simple key detection based on most common pitch classes
    # Major key patterns (WWHWWHW)
    major_keys = [
        (0, 2, 4, 5, 7, 9, 11),   # C
        (1, 3, 5, 6, 8, 10, 0),   # C#/Db
        (2, 4, 6, 7, 9, 11, 1),   # D
        (3, 5, 7, 8, 10, 0, 2),   # Eb
        (4, 6, 8, 9, 11, 1, 3),   # E
        (5, 7, 9, 10, 0, 2, 4),   # F
        (6, 8, 10, 11, 1, 3, 5),  # F#
        (7, 9, 11, 0, 2, 4, 6),   # G
        (8, 10, 0, 1, 3, 5, 7),   # Ab
        (9, 11, 1, 2, 4, 6, 8),   # A
        (10, 0, 2, 3, 5, 7, 9),   # Bb
        (11, 1, 3, 4, 6, 8, 10),  # B
    ]

    key_names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

    # Count occurrences of each pitch class
    counts = {}
    for pc in pitch_classes:
        counts[pc] = counts.get(pc, 0) + 1

    # Score each key
    best_key = "C"
    best_score = 0

    for i, key_pattern in enumerate(major_keys):
        score = sum(counts.get(pc, 0) for pc in key_pattern)
        if score > best_score:
            best_score = score
            best_key = key_names[i]

    return best_key


def _midi_to_pitch(midi: int) -> str:
    """Convert MIDI note number to pitch string (e.g., C4, F#5)."""
    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    octave = (midi // 12) - 1
    note_name = note_names[midi % 12]
    return f"{note_name}{octave}"


def create_mock_score(
    *,
    title: str = "Mock Melody",
    tempo: int = 96,
    time_signature: str = "4/4",
    key: str = "C",
) -> ScoreDraft:
    """Create a mock score for testing. Deprecated - use transcribe_audio."""
    notes = [
        NoteEvent(
            id="note-1",
            pitch="C4",
            midi=60,
            startBeat=0.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.96,
        ),
        NoteEvent(
            id="note-2",
            pitch="D4",
            midi=62,
            startBeat=1.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.94,
        ),
        NoteEvent(
            id="note-3",
            pitch="E4",
            midi=64,
            startBeat=2.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.95,
        ),
        NoteEvent(
            id="note-4",
            pitch="G4",
            midi=67,
            startBeat=3.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.91,
        ),
        NoteEvent(
            id="note-5",
            pitch="A4",
            midi=69,
            startBeat=4.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.9,
        ),
        NoteEvent(
            id="note-6",
            pitch="G4",
            midi=67,
            startBeat=5.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.93,
        ),
        NoteEvent(
            id="note-7",
            pitch="E4",
            midi=64,
            startBeat=6.0,
            durationBeat=1.0,
            velocity=88,
            confidence=0.92,
        ),
        NoteEvent(
            id="note-8",
            pitch="C4",
            midi=60,
            startBeat=7.0,
            durationBeat=2.0,
            velocity=88,
            confidence=0.96,
        ),
    ]

    return ScoreDraft(
        id="draft_mock_001",
        title=title,
        tempo=tempo,
        timeSignature=time_signature,
        key=key,
        notes=notes,
    )