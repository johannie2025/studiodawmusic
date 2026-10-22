"""
Configuration Globale pour DAW IA Pro - MonStudio Chantres
Mode 100% Hors-Ligne (Offline), Exécution CPU forcée et gestion du dossier local /models/.
"""

import os
import sys
from pathlib import Path

# Détection de l'environnement : standalone PyInstaller (_MEIPASS) vs développement
if getattr(sys, 'frozen', False):
    # En mode PyInstaller standalone, l'exécutable est dans le dossier de distribution
    APP_DIR = Path(sys.executable).resolve().parent
    INTERNAL_DIR = Path(getattr(sys, '_MEIPASS', APP_DIR))
else:
    # En mode développement Python classique
    APP_DIR = Path(__file__).resolve().parent.parent
    INTERNAL_DIR = APP_DIR

# Dossiers principaux
MODELS_DIR = APP_DIR / "models"
OUTPUTS_DIR = APP_DIR / "outputs"
FRONTEND_DIST_DIR = APP_DIR / "dist"

# Création garantie des dossiers locaux
MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# Contraintes Techniques Strictes
DEVICE = "cpu"
OFFLINE_MODE = True

# Forcer les variables d'environnement hors-ligne pour HuggingFace et PyTorch
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TORCHAUDIO_USE_BACKEND_DISPATCHER"] = "1"
os.environ["CUDA_VISIBLE_DEVICES"] = ""  # Empêche toute tentative d'allocation GPU

# Chemins des sous-modèles locaux
MUSICGEN_LOCAL_DIR = MODELS_DIR / "musicgen-small"
DEMUCS_LOCAL_DIR = MODELS_DIR / "demucs"

def verify_local_model_exists(model_path: Path, expected_files: list) -> tuple[bool, str]:
    """
    Vérifie qu'un modèle existe physiquement dans le dossier local /models/.
    Ne tente AUCUN téléchargement réseau.
    """
    if not model_path.exists() or not model_path.is_dir():
        msg = (
            f"ERREUR DOSSIER MANQUANT : Le dossier du modèle '{model_path.name}' est introuvable.\n"
            f"Chemin attendu : {model_path.resolve()}\n"
            f"Action requise : Veuillez créer ce dossier et y déposer les poids du modèle."
        )
        return False, msg

    missing = []
    for f in expected_files:
        target = model_path / f
        if not target.exists():
            missing.append(f)

    if missing:
        msg = (
            f"ERREUR POIDS MANQUANTS : Fichiers absents dans '{model_path.name}' : {', '.join(missing)}.\n"
            f"Action requise : Déposez ces fichiers dans {model_path.resolve()} pour activer l'inférence CPU hors-ligne."
        )
        return False, msg

    return True, f"Modèle valide trouvé dans {model_path.resolve()}"
