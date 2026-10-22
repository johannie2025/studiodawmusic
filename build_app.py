"""
Script PyInstaller Standalone - Wise Design Studio by Maestro Josias
Génère MonStudioChantres/ avec MonStudio.exe et _internal/
"""
import sys, shutil, subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
cmd = [
    sys.executable, "-m", "PyInstaller",
    "--name", "MonStudio",
    "--onedir",
    "--windowed",
    "--noconfirm",
    "--clean",
    "backend/main.py",
]
subprocess.run(cmd, cwd=str(BASE), check=True)
dist_out = BASE / "dist" / "MonStudioChantres"
(dist_out / "models" / "musicgen-small").mkdir(parents=True, exist_ok=True)
(dist_out / "outputs").mkdir(parents=True, exist_ok=True)
print("Build terminé avec succès dans", dist_out)
