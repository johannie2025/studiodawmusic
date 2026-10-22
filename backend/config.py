"""
Configuration Globale pour Wise Design Studio by Maestro Josias
DAW IA Pro - Mode 100% Hors-Ligne (Offline), CPU forcé et gestion du dossier local /models/.
WhatsApp: +240222886007 / +240555593398
"""

import os
import sys
from pathlib import Path

# Détection de l'environnement : standalone PyInstaller (_MEIPASS) vs développement
if getattr(sys, 'frozen', False):
    APP_DIR = Path(sys.executable).resolve().parent
    INTERNAL_DIR = Path(getattr(sys, '_MEIPASS', APP_DIR))
else:
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

# Forcer les variables d'environnement hors-ligne
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TORCHAUDIO_USE_BACKEND_DISPATCHER"] = "1"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

MUSICGEN_LOCAL_DIR = MODELS_DIR / "musicgen-small"
DEMUCS_LOCAL_DIR = MODELS_DIR / "demucs"
