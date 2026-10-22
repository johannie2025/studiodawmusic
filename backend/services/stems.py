"""Séparation de stems (Demucs) sur CPU, hors-ligne (poids dans models/torch)."""
import os, uuid
from .. import config

def available():
    import importlib.util
    return importlib.util.find_spec("demucs") is not None

def run(cb, wav_path):
    if not available():
        raise RuntimeError("Demucs n'est pas installé (pip install demucs). Fonction optionnelle.")
    os.environ["TORCH_HOME"] = str(config.MODELS_DIR / "torch")
    from demucs.separate import main as demucs_main
    out = config.MEDIA_DIR / f"stems_{uuid.uuid4().hex[:6]}"
    cb(0.1, "Séparation des pistes (CPU, peut prendre plusieurs minutes)…")
    try:
        demucs_main(["-n", "htdemucs", "--device", "cpu", "-o", str(out), str(wav_path)])
    except SystemExit as e:
        if e.code not in (0, None):
            raise RuntimeError("Demucs a échoué : poids htdemucs absents de models/torch ? (download_models.py --demucs)")
    stems = [{"name": f.stem, "url": "/media/" + f.relative_to(config.MEDIA_DIR).as_posix()} for f in sorted(out.rglob("*.wav"))]
    if not stems:
        raise RuntimeError("Aucun stem produit.")
    return {"stems": stems}
