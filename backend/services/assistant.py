"""Pilotage du mix/interface. Hors-ligne par défaut (commandes locales FR), ou IA en offre gratuite
via API compatible OpenAI (Groq, Gemini, OpenRouter, Mistral, Cerebras, Ollama local)."""
import json, re, unicodedata, urllib.request
from .. import config

PROVIDERS = {
    "groq": {"base": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile"},
    "gemini": {"base": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.0-flash"},
    "openrouter": {"base": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct:free"},
    "mistral": {"base": "https://api.mistral.ai/v1", "model": "mistral-small-latest"},
    "cerebras": {"base": "https://api.cerebras.ai/v1", "model": "llama-3.3-70b"},
    "ollama": {"base": "http://localhost:11434/v1", "model": "llama3.2"},
    "custom": {"base": "", "model": ""},
}
SF = config.DATA_DIR / "settings.json"

def load_settings():
    try:
        return json.loads(SF.read_text("utf-8"))
    except Exception:
        return {"provider": "groq", "model": "", "base_url": "", "api_key": "", "enabled": False}

def save_settings(d):
    cur = load_settings()
    for k in ("provider", "model", "base_url", "enabled"):
        if k in d:
            cur[k] = d[k]
    if d.get("api_key"):
        cur["api_key"] = d["api_key"]
    SF.write_text(json.dumps(cur), "utf-8")

SYSTEM = """Tu es l'assistant de Wise Design Studio (DAW). Tu pilotes le mix et l'interface.
Réponds UNIQUEMENT par un objet JSON : {"reply":"phrase courte en français","actions":[...]}.
Actions possibles (champ "type") :
- set_track : {"type":"set_track","track":"nom ou numéro","volume_db":-60..6,"delta_db":nombre,"pan":-1..1,"mute":bool,"solo":bool,"reverb":0..1,"eq":{"low":dB,"mid":dB,"high":dB},"comp":bool}
- set_master : {"type":"set_master","volume_db":nombre}
- set_bpm : {"type":"set_bpm","bpm":nombre}
- add_track : {"type":"add_track","name":"texte"}
- generate : {"type":"generate","prompt":"description en anglais","duration":secondes,"mode":"free|melody|continue"}
- automix ; transport (action: play|stop|record) ; export (format: wav|mp3) ; select_tab (tab: gen|assistant|inspector|settings)
N'invente pas de pistes. Utilise l'état fourni (niveaux RMS en dBFS). Si la demande est floue, actions vide + question dans reply."""

def _call(cfg, system, user):
    pv = PROVIDERS.get(cfg.get("provider"), PROVIDERS["custom"])
    base = (cfg.get("base_url") or pv["base"]).rstrip("/")
    model = cfg.get("model") or pv["model"]
    body = json.dumps({"model": model, "temperature": 0.2,
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
    req = urllib.request.Request(base + "/chat/completions", body,
                                 {"Content-Type": "application/json", "Authorization": "Bearer " + (cfg.get("api_key") or "none")})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def ask(cfg, message, state):
    raw = _call(cfg, SYSTEM, "ÉTAT: " + json.dumps(state, ensure_ascii=False) + "\nDEMANDE: " + message)
    m = re.search(r"\{.*\}", raw, re.S)
    data = json.loads(m.group(0)) if m else {"reply": raw, "actions": []}
    return {"reply": data.get("reply", ""), "actions": [a for a in data.get("actions", []) if isinstance(a, dict)]}

def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")

def local_parse(msg, tracks):
    m, acts = norm(msg), []
    names = [t["name"] for t in tracks]
    def which():
        for n in names:
            if norm(n) in m:
                return n
        for pats in (("voix", "vocal", "chant"), ("instru", "musique", "piano", "basse", "batterie", "guitare")):
            if any(p in m for p in pats):
                for n in names:
                    if any(p in norm(n) for p in pats):
                        return n
        mm = re.search(r"piste\s*(\d+)", m)
        return mm.group(1) if mm else None
    tr = which()
    num = re.search(r"(-?\d+(?:[.,]\d+)?)", m)
    val = float(num.group(1).replace(",", ".")) if num else None
    b = re.search(r"(\d{2,3})\s*bpm|bpm\s*(?:a|=|:)?\s*(\d{2,3})", m)
    if b:
        acts.append({"type": "set_bpm", "bpm": int(b.group(1) or b.group(2))})
    if re.search(r"\b(genere|cree|compose)", m):
        d = re.search(r"(\d+)\s*(s|sec|secondes?|min)\b", m)
        dur = int(d.group(1)) * (60 if d and d.group(2) == "min" else 1) if d else 30
        acts.append({"type": "generate", "prompt": re.sub(r"\s*\d+\s*(s|sec|secondes?|min)\b", "", re.sub(r"^.*?\b(g[ée]n[èe]re|cr[ée]e|compose)\w*\s*(?:moi\s*)?(?:un|une|des)?\s*", "", msg, flags=re.I | re.S)), "duration": dur, "mode": "free"})
    if re.search(r"auto.?mix|mixage auto|mix auto|equilibre", m):
        acts.append({"type": "automix"})
    if "export" in m:
        acts.append({"type": "export", "format": "mp3" if "mp3" in m else "wav"})
    if re.search(r"\b(enregistre|record)", m):
        acts.append({"type": "transport", "action": "record"})
    elif re.search(r"\b(joue|lecture|play|demarre)", m):
        acts.append({"type": "transport", "action": "play"})
    elif re.search(r"\b(stop|arrete|pause)", m):
        acts.append({"type": "transport", "action": "stop"})
    if tr and not any(a["type"] == "generate" for a in acts):
        a = {"type": "set_track", "track": tr}
        if re.search(r"\bde?mute|reactive|remets? le son", m):
            a["mute"] = False
        elif re.search(r"\b(mute|coupe|silence)", m):
            a["mute"] = True
        if re.search(r"\bsolo\b", m):
            a["solo"] = not re.search(r"(sans|enleve|retire)\s+solo", m)
        if re.search(r"reverb|echo", m) and val is not None:
            a["reverb"] = min(1.0, val / 100 if val > 1 else val)
        if "gauche" in m: a["pan"] = -0.8
        elif "droite" in m: a["pan"] = 0.8
        elif "centre" in m: a["pan"] = 0
        if "compress" in m:
            a["comp"] = True
        if re.search(r"(monte|augmente|plus fort)", m):
            a["delta_db"] = abs(val) if val is not None else 3
        elif re.search(r"(baisse|diminue|moins fort|reduis)", m):
            a["delta_db"] = -(abs(val) if val is not None else 3)
        elif "volume" in m and val is not None and "reverb" not in m:
            a["volume_db"] = val
        if len(a) > 2:
            acts.append(a)
    if not acts:
        return {"reply": "Commande non comprise (mode hors-ligne). Exemples : « baisse l'instru de 3 dB », « mute la voix », « reverb voix 30% », « bpm 120 », « génère un gospel bikutsi 30 s », « mixage auto », « exporte mp3 ». Activez une IA en ligne dans Réglages pour un langage libre.", "actions": []}
    return {"reply": "C'est fait.", "actions": acts}
