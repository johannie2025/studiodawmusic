import shutil, subprocess, sys, wave

def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        p = shutil.which("ffmpeg")
        if not p:
            raise RuntimeError("ffmpeg introuvable (pip install imageio-ffmpeg)")
        return p

def _run(args):
    flags = 0x08000000 if sys.platform == "win32" else 0
    r = subprocess.run(args, capture_output=True, creationflags=flags)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + r.stderr.decode("utf-8", "ignore")[-400:])

def to_wav(src, dst, sr=44100, ch=2):
    _run([ffmpeg_exe(), "-y", "-i", str(src), "-ar", str(sr), "-ac", str(ch), "-c:a", "pcm_s16le", str(dst)])

def encode(src, dst, fmt):
    if fmt == "mp3":
        _run([ffmpeg_exe(), "-y", "-i", str(src), "-c:a", "libmp3lame", "-b:a", "320k", str(dst)])
    else:
        shutil.copyfile(src, dst)

def wav_duration(p):
    with wave.open(str(p), "rb") as w:
        return w.getnframes() / float(w.getframerate())
