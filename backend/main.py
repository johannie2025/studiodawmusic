"""
Serveur FastAPI & Lanceur Standalone Desktop
Wise Design Studio by Maestro Josias - WhatsApp: +240222886007 / +240555593398
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from backend.config import APP_DIR, OUTPUTS_DIR, MODELS_DIR
from backend.services.ai_generator import ai_generator
import shutil, time

app = FastAPI(title="Wise Design Studio DAW IA Pro")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class GenReq(BaseModel):
    prompt: str
    duration: int = 15
    bpm: int = 120
    temperature: float = 1.0

@app.get("/api/status")
def status():
    return {"status": "ok", "app": "Wise Design Studio by Maestro Josias", "models": str(MODELS_DIR)}

@app.post("/api/generate")
def generate(req: GenReq):
    return ai_generator.generate_instrumental(req.prompt, req.duration, req.bpm, req.temperature)

@app.post("/api/generate-from-audio")
async def generate_from_audio(
    file: UploadFile = File(None),
    prompt: str = Form("Accompagnement gospel"),
    bpm: int = Form(120),
    duration: int = Form(20),
    melody_strength: float = Form(0.7)
):
    temp_path = OUTPUTS_DIR / f"ref_{int(time.time())}_{file.filename}"
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return ai_generator.generate_from_reference_audio(str(temp_path), prompt, melody_strength, bpm, duration)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8765, reload=False)
