from .models import NoteEvent, ScoreDraft


MELODY = [
    ("C4", 60, 0.0, 1.0, 0.96),
    ("D4", 62, 1.0, 1.0, 0.94),
    ("E4", 64, 2.0, 1.0, 0.95),
    ("G4", 67, 3.0, 1.0, 0.91),
    ("A4", 69, 4.0, 1.0, 0.9),
    ("G4", 67, 5.0, 1.0, 0.93),
    ("E4", 64, 6.0, 1.0, 0.92),
    ("C4", 60, 7.0, 2.0, 0.96),
]


def create_mock_score(
    *,
    title: str = "Mock Melody",
    tempo: int = 96,
    time_signature: str = "4/4",
    key: str = "C",
) -> ScoreDraft:
    notes = [
        NoteEvent(
            id=f"note-{index + 1}",
            pitch=pitch,
            midi=midi,
            startBeat=start_beat,
            durationBeat=duration_beat,
            velocity=88,
            confidence=confidence,
        )
        for index, (pitch, midi, start_beat, duration_beat, confidence) in enumerate(MELODY)
    ]

    return ScoreDraft(
        id="draft_mock_001",
        title=title,
        tempo=tempo,
        timeSignature=time_signature,
        key=key,
        notes=notes,
    )
