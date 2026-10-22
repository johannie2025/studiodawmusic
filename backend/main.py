import json, re, shutil, threading, time, uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from . import config
from .services import media, assistant, stems

app = FastAPI(title=config.APP_NAME)
JOBS = {}

def new_job(fn, *args):
    jid = uuid.uuid4().hex[:10]
    J = {"id": jid, "status": "running", "progress": 0.0, "message": "Démarrage…", "result": None, "error": None}
    JOBS[jid] = J
    def cb(p, m=None):
        J["progress"] = round(float(p), 3)
        if m: J["message"] = m
    def run():
        try:
            J["result"] = fn(cb, *args); J["status"] = "done"; J["progress"] = 1
        except BaseException as e:
            J["status"] = "error"; J["error"] = f"{type(e).__name__}: {e}"
    threading.Thread(target=run, daemon=True).start()
    return jid

def media_path(url):
    if not url.startswith("/media/"):
        raise HTTPException(400, "URL média invalide")
    p = (config.MEDIA_DIR / url[len("/media/"):].split("?")[0]).resolve()
    if config.MEDIA_DIR.resolve() not in p.parents or not p.exists():
        raise HTTPException(404, "Média introuvable")
    return p

def safe(name, default="mix"):
    return re.sub(r"[^\w\-]+", "_", name).strip("_")[:60] or default

@app.get("/api/status")
def status():
    import importlib.util as u
    try:
        ff = media.ffmpeg_exe() and True
    except Exception:
        ff = False
    from .services import ai_generator
    s = assistant.load_settings()
    return {"app": config.APP_NAME, "device": config.DEVICE, "contacts": config.CONTACTS,
            "models": {k: {"present": ai_generator.model_present(k), "desc": v} for k, v in config.MODELS.items()},
            "torch": u.find_spec("torch") is not None, "transformers": u.find_spec("transformers") is not None,
            "demucs": stems.available(), "ffmpeg": ff, "models_dir": str(config.MODELS_DIR),
            "assistant": {"enabled": bool(s.get("enabled")), "provider": s.get("provider")}}

@app.post("/api/upload")
def upload(file: UploadFile = File(...)):
    raw = config.MEDIA_DIR / f"raw_{uuid.uuid4().hex[:8]}{Path(file.filename or 'a.wav').suffix or '.wav'}"
    with open(raw, "wb") as f:
        shutil.copyfileobj(file.file, f)
    out = config.MEDIA_DIR / f"imp_{uuid.uuid4().hex[:8]}.wav"
    try:
        media.to_wav(raw, out)
    except Exception as e:
        raise HTTPException(400, str(e))
    finally:
        raw.unlink(missing_ok=True)
    return {"url": f"/media/{out.name}", "name": Path(file.filename or "audio").stem, "duration": media.wav_duration(out)}

@app.post("/api/generate")
def generate(body: dict = Body(...)):
    from .services import ai_generator
    guide = media_path(body["guide_url"]) if body.get("guide_url") else None
    return {"job": new_job(ai_generator.run, body, guide)}

@app.post("/api/separate")
def separate(body: dict = Body(...)):
    return {"job": new_job(stems.run, media_path(body["url"]))}

@app.get("/api/jobs/{jid}")
def job(jid: str):
    if jid not in JOBS:
        raise HTTPException(404, "Job inconnu")
    return JOBS[jid]

@app.post("/api/export")
def export(file: UploadFile = File(...), fmt: str = Form("wav"), name: str = Form("mix")):
    fmt = "mp3" if fmt == "mp3" else "wav"
    tmp = config.MEDIA_DIR / f"exp_{uuid.uuid4().hex[:8]}.wav"
    with open(tmp, "wb") as f:
        shutil.copyfileobj(file.file, f)
    out = config.EXPORTS_DIR / f"{safe(name)}_{time.strftime('%Y%m%d_%H%M%S')}.{fmt}"
    try:
        media.encode(tmp, out, fmt)
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        tmp.unlink(missing_ok=True)
    return {"url": f"/exports/{out.name}", "file": str(out)}

@app.post("/api/assistant")
def assistant_ask(body: dict = Body(...)):
    msg, state = body.get("message", ""), body.get("state", {})
    cfg = assistant.load_settings()
    if cfg.get("enabled") and (cfg.get("api_key") or cfg.get("provider") == "ollama"):
        try:
            out = assistant.ask(cfg, msg, state); out["mode"] = "en ligne : " + cfg["provider"]; return out
        except Exception as e:
            out = assistant.local_parse(msg, state.get("tracks", []))
            out["reply"] += f" (IA en ligne indisponible : {e})"; out["mode"] = "local"; return out
    out = assistant.local_parse(msg, state.get("tracks", [])); out["mode"] = "local (hors-ligne)"
    return out

@app.get("/api/settings")
def get_settings():
    s = assistant.load_settings()
    return {**{k: s.get(k) for k in ("provider", "model", "base_url", "enabled")}, "key_set": bool(s.get("api_key")),
            "providers": {k: v for k, v in assistant.PROVIDERS.items()}}

@app.post("/api/settings")
def set_settings(body: dict = Body(...)):
    assistant.save_settings(body); return {"ok": True}

@app.get("/api/projects")
def projects():
    return sorted(p.stem for p in config.PROJECTS_DIR.glob("*.json"))

@app.post("/api/projects/save")
def project_save(body: dict = Body(...)):
    n = safe(body.get("name", "projet"), "projet")
    (config.PROJECTS_DIR / f"{n}.json").write_text(json.dumps(body.get("project", {})), "utf-8")
    return {"ok": True, "name": n}

@app.get("/api/projects/{name}")
def project_load(name: str):
    p = config.PROJECTS_DIR / f"{safe(name)}.json"
    if not p.exists():
        raise HTTPException(404, "Projet introuvable")
    return json.loads(p.read_text("utf-8"))

@app.get("/")
def index():
    return FileResponse(config.FRONTEND_DIR / "index.html")

app.mount("/media", StaticFiles(directory=config.MEDIA_DIR), name="media")
app.mount("/exports", StaticFiles(directory=config.EXPORTS_DIR), name="exports")
app.mount("/static", StaticFiles(directory=config.FRONTEND_DIR), name="static")
