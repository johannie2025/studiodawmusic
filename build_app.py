"""Construit le dossier distribuable Windows (PyInstaller, mode onedir).
Usage : python build_app.py [--windowed]   (à lancer sous Windows, dans le venv)"""
import os, shutil, sys
from pathlib import Path
import PyInstaller.__main__ as pi
ROOT = Path(__file__).parent
args = ["run.py", "--name", "WiseDesignStudio", "--noconfirm", "--clean", "--onedir",
        "--add-data", f"frontend{os.pathsep}frontend",
        "--collect-all", "imageio_ffmpeg", "--collect-all", "transformers", "--collect-all", "scipy",
        "--hidden-import", "uvicorn.logging", "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols.http.auto", "--hidden-import", "uvicorn.lifespan.on"]
try:
    import demucs; args += ["--collect-all", "demucs"]
except ImportError:
    pass
if "--windowed" in sys.argv:
    args.append("--windowed")
pi.run(args)
out = ROOT / "dist" / "WiseDesignStudio"
for d in ("models", "outputs", "projects", "data"):
    (out / d).mkdir(exist_ok=True)
shutil.copy(ROOT / "models" / "LISEZMOI.txt", out / "models" / "LISEZMOI.txt")
print("\nLivrable :", out, "\nCopiez vos poids dans", out / "models")
