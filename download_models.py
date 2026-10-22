"""À lancer UNE SEULE FOIS sur un PC connecté à Internet, puis copier le dossier /models/ sur les PC du studio.
Usage : python download_models.py [--melody] [--demucs]
(Nécessite : pip install huggingface_hub)"""
import os, sys
from pathlib import Path
for k in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE"):
    os.environ.pop(k, None)
M = Path(__file__).parent / "models"
M.mkdir(exist_ok=True)
from huggingface_hub import snapshot_download
def get(repo, name):
    print("Téléchargement", repo)
    snapshot_download(repo, local_dir=M / name, allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model"])
get("facebook/musicgen-small", "musicgen-small")
if "--melody" in sys.argv:
    get("facebook/musicgen-melody", "musicgen-melody")
if "--demucs" in sys.argv:
    os.environ["TORCH_HOME"] = str(M / "torch")
    from demucs.pretrained import get_model
    get_model("htdemucs")
print("OK ->", M)
