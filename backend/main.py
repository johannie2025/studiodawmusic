"""
Serveur Principal FastAPI & Lanceur Standalone (MonStudio Chantres DAW IA Pro)
"""

import os
import sys
import time
import shutil
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import (
    APP_DIR, MODELS_DIR, OUTPUTS_DIR, FRONTEND_DIST_DIR,
    DEVICE, OFFLINE_MODE, MUSICGEN_LOCAL_DIR, DEMUCS_LOCAL_DIR
)
from backend.services.ai_generator import ai_generator
from backend.services.stem_separator import stem_separator

app = FastAPI(
    title="DAW IA Pro - MonStudio Chantres",
    description="Studio de production musicale IA 100% Hors-Ligne sur CPU",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str
    duration: int = 15
    bpm: int = 120
    temperature: float = 1.0

@app.get("/api/status")
def get_system_status():
    """Retourne l'état complet du système, du CPU et des modèles hors-ligne."""
    musicgen_status = ai_generator.check_weights_status()
    demucs_status = stem_separator.check_weights_status()

    output_files = [
        {"name": f.name, "size": f.stat().st_size, "modified": f.stat().st_mtime}
        for f in OUTPUTS_DIR.glob("*.wav")
    ]

    return {
        "status": "ready",
        "mode": "100% Hors-Ligne (Offline)",
        "device": DEVICE,
        "app_directory": str(APP_DIR.resolve()),
        "models_directory": str(MODELS_DIR.resolve()),
        "outputs_directory": str(OUTPUTS_DIR.resolve()),
        "musicgen": musicgen_status,
        "demucs": demucs_status,
        "outputs_count": len(output_files),
        "recent_outputs": sorted(output_files, key=lambda x: x["modified"], reverse=True)[:5]
    }

@app.get("/api/models-check")
def check_models():
    """Vérification stricte de la présence des fichiers dans /models/."""
    return {
        "musicgen": ai_generator.check_weights_status(),
        "demucs": stem_separator.check_weights_status(),
        "instructions": (
            "Déposez vos fichiers modèles dans le dossier 'models/' à la racine de l'application :\n"
            "- models/musicgen-small/ (fichiers .safetensors ou .bin)\n"
            "- models/demucs/ (fichiers .th)\n"
            "Aucune connexion Internet n'est requise."
        )
    }

@app.post("/api/generate")
def generate_track(req: GenerateRequest):
    """Génération libre de l'instrumental sur PISTE 1."""
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Le prompt d'instrumental ne peut pas être vide.")

    try:
        result = ai_generator.generate_instrumental(
            prompt=req.prompt,
            duration=min(max(req.duration, 5), 60),
            bpm=req.bpm,
            temperature=req.temperature,
            use_fallback_if_empty=True
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-from-audio")
async def generate_track_from_audio(
    file: UploadFile = File(None),
    existing_filename: str = Form(None),
    prompt: str = Form("Accompagnement gospel harmonisé"),
    bpm: int = Form(120),
    duration: int = Form(20),
    melody_strength: float = Form(0.7)
):
    """
    Génération d'instrumental basée sur l'audio d'une chanson ou voix de chantre.
    L'IA analyse la mélodie, les accords et le tempo du fichier audio pour composer l'instrumental.
    """
    ref_file_path = None

    if file and file.filename:
        temp_filename = f"ref_song_{int(time.time())}_{file.filename}"
        ref_file_path = OUTPUTS_DIR / temp_filename
        with open(ref_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    elif existing_filename:
        candidate = OUTPUTS_DIR / existing_filename
        if candidate.exists():
            ref_file_path = candidate

    if not ref_file_path or not ref_file_path.exists():
        raise HTTPException(status_code=400, detail="Aucun fichier audio de chanson fourni en référence.")

    try:
        result = ai_generator.generate_from_reference_audio(
            reference_audio_path=str(ref_file_path.resolve()),
            style_prompt=prompt,
            melody_strength=melody_strength,
            bpm=bpm,
            duration=min(max(duration, 5), 60),
            use_fallback_if_empty=True
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/record-vocal")
async def save_vocal_recording(
    file: UploadFile = File(...),
    chantre_name: str = Form("Chantre")
):
    """Sauvegarde de la voix du chantre enregistrée sur PISTE 2."""
    timestamp = int(time.time())
    safe_name = "".join(c for c in chantre_name if c.isalnum() or c in ("-", "_")).rstrip()
    filename = f"vocal_{safe_name}_{timestamp}.wav"
    target_path = OUTPUTS_DIR / filename

    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "success": True,
        "filename": filename,
        "path": str(target_path.resolve()),
        "chantre": chantre_name
    }

@app.post("/api/separate-stems")
def separate_track_stems(filename: str):
    """Sépare une piste instrumentale ou complète en 4 pistes audio distinctes."""
    target_path = OUTPUTS_DIR / filename
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Fichier audio introuvable dans outputs/")

    return stem_separator.separate(str(target_path))

@app.get("/api/outputs/{filename}")
def serve_output_file(filename: str):
    """Téléchargement direct d'un fichier audio généré."""
    file_path = OUTPUTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    return FileResponse(path=str(file_path), media_type="audio/wav", filename=filename)

# Montage du frontend statique compilé
if FRONTEND_DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST_DIR), html=True), name="frontend")

def run_app():
    """Point d'entrée pour lancement en console ou fenêtre desktop webview."""
    import uvicorn
    import threading

    port = 8765

    # Lancement du serveur uvicorn dans un thread d'arrière-plan
    def start_server():
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(1.2)

    # Si pywebview est disponible, ouvrir la fenêtre native Windows
    try:
        import webview
        print("[MONSTUDIO] Ouverture de la fenêtre native DAW...")
        webview.create_window(
            title="DAW IA Pro - MonStudio Chantres (Hors-Ligne CPU)",
            url=f"http://127.0.0.1:{port}",
            width=1320,
            height=860,
            resizable=True
        )
        webview.start()
    except Exception as e:
        print(f"[MONSTUDIO] PyWebView indisponible ({e}), ouverture dans le navigateur...")
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{port}")
        # Maintien du serveur actif
        server_thread.join()

if __name__ == "__main__":
    run_app()
