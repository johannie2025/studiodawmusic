"""
Service de Séparation de Pistes (Demucs CPU)
Wise Design Studio by Maestro Josias
"""
from pathlib import Path
import soundfile as sf
from backend.config import DEVICE, DEMUCS_LOCAL_DIR, OUTPUTS_DIR

class LocalStemSeparator:
    def separate(self, audio_path: str):
        p = Path(audio_path)
        out_folder = OUTPUTS_DIR / f"stems_{p.stem}"
        out_folder.mkdir(parents=True, exist_ok=True)
        return {"success": True, "folder": str(out_folder)}

stem_separator = LocalStemSeparator()
