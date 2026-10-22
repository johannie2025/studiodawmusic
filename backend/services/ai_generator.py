"""Génération musicale locale (MusicGen via transformers) — CPU, hors-ligne.
Modes : free (texte), melody (guidé par voix/piste), continue (prolonge un extrait)."""
import os, threading, uuid
import numpy as np
from scipy.io import wavfile
from .. import config
from . import media

SR = 32000
_lock = threading.Lock()
_cache = {}

def model_present(name):
    return (config.MODELS_DIR / name / "config.json").exists()

def _load(name):
    if name in _cache:
        return _cache[name]
    path = config.MODELS_DIR / name
    if not model_present(name):
        raise FileNotFoundError(
            f"Modèle absent : {path} (config.json introuvable). Copiez le dossier « {name} » dans /models/ "
            f"(voir README, script download_models.py). Aucun téléchargement automatique n'est tenté.")
    import torch
    torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
    from transformers import AutoProcessor
    if "melody" in name:
        from transformers import MusicgenMelodyForConditionalGeneration as M
    else:
        from transformers import MusicgenForConditionalGeneration as M
    proc = AutoProcessor.from_pretrained(str(path), local_files_only=True)
    model = M.from_pretrained(str(path), local_files_only=True).to(config.DEVICE).eval()
    _cache[name] = (model, proc)
    return _cache[name]

def _read_guide(path):
    tmp = config.MEDIA_DIR / f"g_{uuid.uuid4().hex[:8]}.wav"
    media.to_wav(path, tmp, sr=SR, ch=1)
    sr, a = wavfile.read(tmp)
    tmp.unlink(missing_ok=True)
    return a.astype(np.float32) / 32768.0

class _Prog:
    def __init__(self, cb, base, span, tokens):
        self.cb, self.base, self.span, self.tokens = cb, base, span, max(1, tokens)
    def __call__(self, input_ids, scores, **kw):
        import torch
        try:
            self.cb(self.base + self.span * min(1.0, input_ids.shape[-1] / self.tokens), "Génération en cours (CPU)…")
        except Exception:
            pass
        return torch.zeros(input_ids.shape[0], dtype=torch.bool)

def _gen(model, proc, text, seconds, p, audio=None, cb=None, base=0.0, span=1.0):
    import torch
    from transformers import StoppingCriteriaList
    kw = dict(text=[text], padding=True, return_tensors="pt")
    if audio is not None:
        kw.update(audio=audio, sampling_rate=SR)
    inputs = proc(**kw)
    tokens = int(seconds * 50)
    with torch.no_grad():
        out = model.generate(**inputs, do_sample=True, temperature=float(p["temperature"]),
                             top_k=250, guidance_scale=float(p["guidance"]), max_new_tokens=tokens,
                             stopping_criteria=StoppingCriteriaList([_Prog(cb, base, span, tokens)]))
    return out[0, 0].cpu().numpy().astype(np.float32)

def _xfade(a, b, sec=0.5):
    n = min(int(sec * SR), len(a), len(b))
    if n <= 0:
        return np.concatenate([a, b])
    w = np.linspace(0, 1, n, dtype=np.float32)
    return np.concatenate([a[:-n], a[-n:] * (1 - w) + b[:n] * w, b[n:]])

def run(cb, body, guide_path):
    with _lock:
        mode = body.get("mode", "free")
        dur = float(np.clip(float(body.get("duration", 20)), 5, 180))
        name = body.get("model") or ("musicgen-melody" if mode == "melody" and model_present("musicgen-melody") else "musicgen-small")
        cb(0.02, f"Chargement du modèle {name}…")
        model, proc = _load(name)
        text = (body.get("prompt") or "").strip() or "instrumental music"
        if body.get("bpm"):
            text += f", {int(body['bpm'])} BPM"
        p = {"temperature": body.get("temperature", 1.0), "guidance": body.get("guidance", 3.0)}
        guide = _read_guide(guide_path) if guide_path else None
        if mode in ("melody", "continue") and guide is None:
            raise ValueError("Source audio manquante pour ce mode.")

        if mode == "melody" and "melody" in name:
            parts, pos = [], 0.0
            n = max(1, int(np.ceil(dur / 30)))
            while pos < dur:
                s = min(30.0, dur - pos)
                g = guide[int(pos * SR): int((pos + 30) * SR)]
                if len(g) < SR:
                    g = guide[-30 * SR:]
                parts.append(_gen(model, proc, text, s, p, audio=g, cb=cb, base=0.05 + 0.9 * len(parts) / n, span=0.9 / n))
                pos += 30
            audio = parts[0]
            for x in parts[1:]:
                audio = _xfade(audio, x)
        else:
            if mode == "continue":
                audio = guide[-10 * SR:]
                skip = len(audio)
            else:
                first = min(30.0, dur)
                audio = _gen(model, proc, text, first, p, cb=cb, base=0.05, span=0.9 * first / dur)
                skip = 0
            while (len(audio) - skip) / SR < dur - 0.5:
                have = (len(audio) - skip) / SR
                need = min(20.0, dur - have)
                prompt = audio[-10 * SR:]
                out = _gen(model, proc, text, need, p, audio=prompt, cb=cb,
                           base=0.05 + 0.9 * min(0.95, have / dur), span=0.9 * need / dur)
                new = out[len(prompt):] if len(out) > len(prompt) else out  # la sortie contient l'amorce
                audio = _xfade(audio, np.concatenate([prompt[-int(0.5 * SR):], new]), 0.5)
            audio = audio[skip:]
        audio = audio[: int(dur * SR)]
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = audio / peak * 0.95
        fn = f"gen_{uuid.uuid4().hex[:8]}.wav"
        wavfile.write(config.MEDIA_DIR / fn, SR, (audio * 32767).astype(np.int16))
        cb(0.99, "Terminé")
        return {"url": f"/media/{fn}", "duration": len(audio) / SR, "model": name}
