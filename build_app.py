"""
Script de Compilation PyInstaller pour MonStudio Chantres (DAW IA Pro Standalone)
Génère la structure finale Windows :
MonStudioChantres/
├── MonStudio.exe            # Exécutable compilé
├── _internal/               # Dépendances Python et bibliothèques C++ / PyTorch CPU
├── models/                  # Dossier pour les poids hors-ligne
│   └── musicgen-small/
└── outputs/                 # Dossier des enregistrements et exports
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"
FINAL_APP_DIR = DIST_DIR / "MonStudioChantres"
MODELS_DIR = FINAL_APP_DIR / "models"
OUTPUTS_DIR = FINAL_APP_DIR / "outputs"

def clean_previous_builds():
    """Nettoie uniquement les dossiers d'exécutables sans effacer le build du frontend."""
    print("🧹 Nettoyage des précédents builds...")
    build_dir = BASE_DIR / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir, ignore_errors=True)

    for old_folder in ["MonStudio", "MonStudioChantres"]:
        target = DIST_DIR / old_folder
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)

def verify_frontend():
    """Vérifie que le frontend web dist a bien été compilé."""
    dist_index = BASE_DIR / "dist" / "index.html"
    if not dist_index.exists():
        print("⚡ Compilation du Frontend Vite...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=str(BASE_DIR), check=True, shell=True)
        except Exception as e:
            print(f"⚠️ Avertissement lors du build frontend Vite : {e}")

def run_pyinstaller():
    """Exécute PyInstaller avec mode --onedir pour placer les dépendances dans _internal/."""
    print("🔨 Lancement de PyInstaller pour MonStudio.exe...")

    # Inclusion des dossiers statiques et données
    add_data_args = []
    
    # Inclusion du frontend compilé
    if (BASE_DIR / "dist").exists():
        sep = ";" if sys.platform.startswith("win") else ":"
        add_data_args.extend(["--add-data", f"dist{sep}dist"])

    # Hidden imports critiques pour PyTorch CPU, AudioCraft, FastAPI et uvicorn
    hidden_imports = [
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "fastapi.middleware.cors",
        "torch",
        "torchaudio",
        "soundfile",
        "scipy",
        "scipy.signal",
        "numpy",
        "audiocraft",
        "demucs",
        "pywebview",
        "webview",
        "backend.config",
        "backend.services.ai_generator",
        "backend.services.stem_separator",
    ]

    hidden_args = []
    for h in hidden_imports:
        hidden_args.extend(["--hidden-import", h])

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "MonStudio",
        "--onedir",                       # Génère l'exécutable + le sous-dossier _internal/
        "--windowed",                     # Sans console noire en mode production
        "--noconfirm",
        "--clean",
        "backend/main.py",
    ] + add_data_args + hidden_args

    print("Commande PyInstaller :", " ".join(cmd))
    subprocess.run(cmd, cwd=str(BASE_DIR), check=True)

def structure_final_distribution():
    """Organise le dossier final MonStudioChantres/ conforme aux spécifications."""
    print("📦 Structuration de l'arborescence finale de distribution...")

    pyinstaller_output = DIST_DIR / "MonStudio"
    if not pyinstaller_output.exists():
        print(f"❌ Erreur : Dossier de sortie PyInstaller introuvable : {pyinstaller_output}")
        return

    # Renommage ou déplacement vers MonStudioChantres
    if FINAL_APP_DIR.exists():
        shutil.rmtree(FINAL_APP_DIR, ignore_errors=True)
    
    shutil.move(str(pyinstaller_output), str(FINAL_APP_DIR))

    # Création du dossier /models/ et sous-dossiers
    (MODELS_DIR / "musicgen-small").mkdir(parents=True, exist_ok=True)
    (MODELS_DIR / "demucs").mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    # Création du fichier d'aide README dans models/
    readme_models_path = MODELS_DIR / "README_MODELS.txt"
    readme_content = (
        "===========================================================\n"
        "DOSSIER POIDS DE MODELES HORS-LIGNE (OFFLINE CPU)\n"
        "===========================================================\n\n"
        "1. Pour le générateur d'instrumentaux (MusicGen) :\n"
        "   Déposez vos fichiers de modèle (state_dict.bin, compression_state_dict.bin\n"
        "   ou model.safetensors) directement dans :\n"
        "   models/musicgen-small/\n\n"
        "2. Pour la séparation de pistes (Demucs / BS-Roformer) :\n"
        "   Déposez le modèle htdemucs.th dans :\n"
        "   models/demucs/\n\n"
        "Note : L'application n'effectue AUCUNE requête Internet.\n"
        "Elle utilise exclusivement les fichiers de ce dossier.\n"
    )
    with open(readme_models_path, "w", encoding="utf-8") as f:
        f.write(readme_content)

    # Création du fichier d'aide général
    readme_app = FINAL_APP_DIR / "LISEZ-MOI_DEMARRAGE.txt"
    app_info = (
        "===========================================================\n"
        "DAW IA PRO - MONSTUDIO CHANTRES (VERSION STANDALONE CPU)\n"
        "===========================================================\n\n"
        "Structure du dossier :\n"
        "- MonStudio.exe         : Lanceur de la station DAW IA\n"
        "- _internal/            : Bibliothèques Python et PyTorch CPU\n"
        "- models/               : Dossier des modèles IA hors-ligne\n"
        "- outputs/              : Dossier des enregistrements et exports WAV/MP3\n\n"
        "Pour lancer le studio, double-cliquez simplement sur MonStudio.exe !\n"
    )
    with open(readme_app, "w", encoding="utf-8") as f:
        f.write(app_info)

    print("\n✅ Compilation terminée avec succès !")
    print(f"📁 Dossier prêt à distribuer : {FINAL_APP_DIR.resolve()}")
    print("Contenu :")
    for item in FINAL_APP_DIR.iterdir():
        print(f"  ├── {item.name}")

if __name__ == "__main__":
    clean_previous_builds()
    verify_frontend()
    run_pyinstaller()
    structure_final_distribution()
