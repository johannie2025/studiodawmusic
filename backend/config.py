import os, sys
from pathlib import Path

APP_NAME = "Wise Design Studio by Maestro Josias"
CONTACTS = ["+240222886007", "+240555593398"]
FROZEN = getattr(sys, "frozen", False)
BASE_DIR = Path(sys.executable).parent if FROZEN else Path(__file__).resolve().parent.parent
RES_DIR = Path(getattr(sys, "_MEIPASS", BASE_DIR))

MODELS_DIR = BASE_DIR / "models"          # <-- poids des modèles (.safetensors/.bin)
OUTPUTS_DIR = BASE_DIR / "outputs"
MEDIA_DIR = OUTPUTS_DIR / "media"
EXPORTS_DIR = OUTPUTS_DIR / "exports"
PROJECTS_DIR = BASE_DIR / "projects"
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = RES_DIR / "frontend"

DEVICE = "cpu"                              # inférence forcée sur CPU
HOST, PORT = "127.0.0.1", 8765

MODELS = {
    "musicgen-small": "Génération texte -> musique (rapide sur CPU)",
    "musicgen-melody": "Génération guidée par une mélodie (voix / piste)",
}

# Mode strictement hors-ligne pour HuggingFace / PyTorch
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"
os.environ.setdefault("TORCH_HOME", str(MODELS_DIR / "torch"))

for d in (MODELS_DIR, MEDIA_DIR, EXPORTS_DIR, PROJECTS_DIR, DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)
