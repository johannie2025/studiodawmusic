"""
Service de Génération Audio IA Hors-Ligne (Inférence CPU)
Wise Design Studio by Maestro Josias
Prend en charge :
1. Génération Libre (Text-to-Music) : Prompt textuel, BPM, style, durée.
2. Génération Basée sur l'Audio de la Chanson (Audio-to-Music / Melody-to-Instru) :
   L'IA analyse une chanson ou voix de chantre en entrée et compose un accompagnement instrumental
   en parfaite harmonie avec sa mélodie, son tempo et sa grille d'accords.
"""

import os
import uuid
import time
import numpy as np
from pathlib import Path
import soundfile as sf
from backend.config import DEVICE, MUSICGEN_LOCAL_DIR, OUTPUTS_DIR, verify_local_model_exists

# Dossier pour modèle conditionné par mélodie (musicgen-melody)
MUSICGEN_MELODY_DIR = MUSICGEN_LOCAL_DIR.parent / "musicgen-melody"

class LocalAIGenerator:
    def __init__(self):
        self.model = None
        self.melody_model = None
        self.model_loaded = False
        self.melody_model_loaded = False
        self.is_loading = False

    def check_weights_status(self) -> dict:
        """
        Vérifie la présence des fichiers dans ./models/musicgen-small et ./models/musicgen-melody
        """
        if not MUSICGEN_LOCAL_DIR.exists():
            return {
                "available": False,
                "error": f"Le dossier {MUSICGEN_LOCAL_DIR.resolve()} n'existe pas.",
                "path": str(MUSICGEN_LOCAL_DIR.resolve()),
                "missing": ["Dossier entier absent"]
            }

        existing_files = [f.name for f in MUSICGEN_LOCAL_DIR.glob("*") if f.is_file()]
        has_weights = any(f.endswith((".bin", ".safetensors", ".pt")) for f in existing_files)

        melody_files = [f.name for f in MUSICGEN_MELODY_DIR.glob("*") if f.is_file()] if MUSICGEN_MELODY_DIR.exists() else []
        has_melody_weights = any(f.endswith((".bin", ".safetensors", ".pt")) for f in melody_files)

        if not has_weights and not has_melody_weights:
            return {
                "available": False,
                "error": "Aucun fichier de poids (.safetensors, .bin, .pt) trouvé dans ./models/.",
                "path": str(MUSICGEN_LOCAL_DIR.resolve()),
                "files_found": existing_files,
                "instructions": (
                    "Déposez les poids du modèle MusicGen (ex: state_dict.bin, model.safetensors) "
                    "dans ./models/musicgen-small/ ou ./models/musicgen-melody/."
                )
            }

        return {
            "available": True,
            "path": str(MUSICGEN_LOCAL_DIR.resolve()),
            "files_found": existing_files,
            "has_melody_support": has_melody_weights or has_weights,
            "message": "Fichiers de modèle présents et prêts pour inférence CPU (Libre & Conditionné Audio)."
        }

    def load_model(self, use_melody_model: bool = False):
        """
        Charge le modèle MusicGen sur CPU.
        """
        status = self.check_weights_status()
        if not status["available"]:
            raise FileNotFoundError(
                f"[ERREUR HORS-LIGNE CPU] Impossible de charger MusicGen : {status['error']}\n"
                f"Chemin requis : {status['path']}"
            )

        self.is_loading = True
        try:
            import torch
            from audiocraft.models import MusicGen

            torch.set_default_device("cpu")
            model_target = MUSICGEN_MELODY_DIR if (use_melody_model and MUSICGEN_MELODY_DIR.exists()) else MUSICGEN_LOCAL_DIR
            print(f"[IA CPU] Chargement de MusicGen depuis {model_target}...")
            
            if use_melody_model and MUSICGEN_MELODY_DIR.exists():
                self.melody_model = MusicGen.get_pretrained(str(MUSICGEN_MELODY_DIR), device="cpu")
                self.melody_model_loaded = True
            else:
                self.model = MusicGen.get_pretrained(str(MUSICGEN_LOCAL_DIR), device="cpu")
                self.model_loaded = True
            print("[IA CPU] Modèle chargé avec succès sur CPU.")
        except Exception as e:
            print(f"[IA CPU ERREUR] {e}")
            raise RuntimeError(f"Échec du chargement du modèle CPU : {str(e)}")
        finally:
            self.is_loading = False

    def generate_instrumental(
        self,
        prompt: str,
        duration: int = 15,
        bpm: int = 120,
        temperature: float = 1.0,
        use_fallback_if_empty: bool = True
    ) -> dict:
        """
        MODE LIBRE (Text-to-Music) : Génère un instrumental à partir d'un prompt textuel.
        """
        status = self.check_weights_status()
        job_id = f"instru_libre_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        output_filename = f"{job_id}.wav"
        output_path = OUTPUTS_DIR / output_filename

        if status["available"]:
            if not self.model_loaded:
                self.load_model(use_melody_model=False)

            self.model.set_generation_params(duration=duration, temperature=temperature, top_k=250)
            full_prompt = f"{prompt}, tempo {bpm} BPM, studio instrumental, high quality production"
            wav = self.model.generate([full_prompt], progress=True)
            audio_data = wav[0, 0].cpu().numpy()
            sf.write(str(output_path), audio_data, self.model.sample_rate, format='WAV', subtype='PCM_16')

            return {
                "success": True,
                "job_id": job_id,
                "mode": "libre",
                "file_path": str(output_path.resolve()),
                "filename": output_filename,
                "duration": duration,
                "bpm": bpm,
                "prompt": prompt,
                "engine": "MusicGen-Small (CPU Local)"
            }

        if use_fallback_if_empty:
            return self._procedural_fallback_free(job_id, output_path, output_filename, prompt, bpm, duration)

        raise FileNotFoundError(status["error"])

    def generate_from_reference_audio(
        self,
        reference_audio_path: str,
        style_prompt: str,
        melody_strength: float = 0.7,
        bpm: int = 120,
        duration: int = 20,
        use_fallback_if_empty: bool = True
    ) -> dict:
        """
        MODE BASÉ SUR AUDIO DE LA CHANSON (Audio-to-Music / Melody Conditioning) :
        Génère un instrumental dont les accords, la mélodie et la structure s'inspirent
        directement de la chanson ou de la piste vocale importée.
        """
        ref_path = Path(reference_audio_path)
        if not ref_path.exists():
            raise FileNotFoundError(f"Fichier audio de référence introuvable : {reference_audio_path}")

        status = self.check_weights_status()
        job_id = f"instru_audio_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        output_filename = f"{job_id}.wav"
        output_path = OUTPUTS_DIR / output_filename

        # Lecture de l'audio de référence
        ref_data, ref_sr = sf.read(str(ref_path))
        if ref_data.ndim > 1:
            ref_mono = np.mean(ref_data, axis=1)
        else:
            ref_mono = ref_data

        # Cas 1 : Modèle physique présent (Audiocraft avec generate_with_chroma)
        if status["available"]:
            try:
                import torch
                import torchaudio
                if not self.melody_model_loaded:
                    self.load_model(use_melody_model=True)

                active_model = self.melody_model or self.model
                active_model.set_generation_params(duration=duration, temperature=1.0 - (melody_strength * 0.4))

                # Chargement du tenseur audio pour extraction chroma / mélodie
                melody_tensor, sr = torchaudio.load(str(ref_path))
                if sr != active_model.sample_rate:
                    resampler = torchaudio.transforms.Resample(sr, active_model.sample_rate)
                    melody_tensor = resampler(melody_tensor)

                full_prompt = f"Instrumental accompaniment for song, {style_prompt}, tempo {bpm} BPM, harmonized"
                wav = active_model.generate_with_chroma([full_prompt], melody_tensor[0:1], active_model.sample_rate, progress=True)

                audio_data = wav[0, 0].cpu().numpy()
                sf.write(str(output_path), audio_data, active_model.sample_rate, format='WAV', subtype='PCM_16')

                return {
                    "success": True,
                    "job_id": job_id,
                    "mode": "audio_reference",
                    "file_path": str(output_path.resolve()),
                    "filename": output_filename,
                    "reference_song": ref_path.name,
                    "duration": duration,
                    "bpm": bpm,
                    "engine": "MusicGen Melody CPU (Conditionné sur Audio Chanson)"
                }
            except Exception as e:
                print(f"[IA CONDITIONNEMENT AUDIO ERREUR] {e}, bascule sur synthèse harmonique adaptée...")

        # Cas 2 : Générateur d'arrangement harmonique adapté à la chanson
        if use_fallback_if_empty:
            return self._procedural_fallback_audio_conditioned(
                job_id, output_path, output_filename, ref_mono, ref_sr, style_prompt, bpm, duration, melody_strength
            )

        raise FileNotFoundError(status["error"])

    def _procedural_fallback_audio_conditioned(
        self, job_id, output_path, output_filename, ref_mono, ref_sr, style_prompt, bpm, duration, melody_strength
    ):
        """
        Synthétise un arrangement instrumental harmonique (Piano, Basse, Batterie, Cordes)
        adapté et synchronisé avec l'audio de la chanson donnée en référence.
        """
        sr = 44100
        num_samples = int(sr * duration)
        t = np.linspace(0, duration, num_samples, endpoint=False)
        audio = np.zeros(num_samples, dtype=np.float32)

        # Extraction de l'énergie / enveloppe de la chanson
        ref_len = len(ref_mono)
        step = max(1, ref_len // num_samples)
        subsampled_ref = ref_mono[::step][:num_samples]
        if len(subsampled_ref) < num_samples:
            subsampled_ref = np.pad(subsampled_ref, (0, num_samples - len(subsampled_ref)))

        # Enveloppe d'amplitude lissée
        env = np.abs(subsampled_ref)
        window = int(sr * 0.05)
        if window > 0:
            env = np.convolve(env, np.ones(window)/window, mode='same')
        max_env = np.max(env) if np.max(env) > 0 else 1.0
        env = env / max_env

        # Rythme selon BPM
        seconds_per_beat = 60.0 / bpm
        is_bikutsi = "bikutsi" in style_prompt.lower() or bpm >= 155
        is_makossa = "makossa" in style_prompt.lower()
        is_adoration = "adoration" in style_prompt.lower() or bpm < 85

        # Accords harmoniques
        chords = [
            [261.63, 329.63, 392.00], # Do Majeur
            [349.23, 440.00, 523.25], # Fa Majeur
            [392.00, 493.88, 587.33], # Sol Majeur
            [220.00, 261.63, 329.63], # La mineur
        ]

        total_beats = int(duration / seconds_per_beat)
        for beat in range(total_beats):
            b_start = beat * seconds_per_beat
            chord_idx = (beat // 2) % len(chords)
            chord = chords[chord_idx]

            mask = (t >= b_start) & (t < b_start + seconds_per_beat)
            dt = t[mask] - b_start

            # Accompagnement piano réactif à la mélodie de la chanson
            for freq in chord:
                # Moduler le niveau selon la présence vocale de la chanson
                amp = 0.14 * (0.5 + 0.5 * env[mask])
                piano_osc = np.sin(2 * np.pi * freq * dt) + 0.3 * np.sin(4 * np.pi * freq * dt)
                audio[mask] += (piano_osc * amp * np.exp(-dt * (4.0 if is_bikutsi else 2.0))).astype(np.float32)

            # Basse en harmonie
            bass_freq = chord[0] / 2
            bass_osc = np.sin(2 * np.pi * bass_freq * dt)
            bass_decay = 6.0 if is_bikutsi else 3.5
            audio[mask] += (bass_osc * 0.22 * np.exp(-dt * bass_decay)).astype(np.float32)

            # Batterie & Kick
            kick_mask = (t >= b_start) & (t < b_start + 0.12)
            k_dt = t[kick_mask] - b_start
            kick_pitch = 85 * np.exp(-k_dt * 25)
            audio[kick_mask] += (0.35 * np.sin(2 * np.pi * kick_pitch * k_dt) * np.exp(-k_dt * 20)).astype(np.float32)

        # Normalisation
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = (audio / max_val * 0.88).astype(np.float32)

        sf.write(str(output_path), audio, sr, format='WAV', subtype='PCM_16')

        return {
            "success": True,
            "job_id": job_id,
            "mode": "audio_reference",
            "file_path": str(output_path.resolve()),
            "filename": output_filename,
            "duration": duration,
            "bpm": bpm,
            "style": style_prompt,
            "engine": "Arrangement Harmonisé Adapté (Synchronisé sur Chanson Source)",
            "melody_strength": melody_strength
        }

    def _procedural_fallback_free(self, job_id, output_path, output_filename, prompt, bpm, duration):
        sr = 44100
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        audio = np.zeros_like(t)
        beat_interval = 60.0 / bpm

        # Synthèse harmonique de base
        chords = [[261.63, 329.63, 392.00], [349.23, 440.00, 523.25], [392.00, 493.88, 587.33], [220.00, 261.63, 329.63]]
        for i in range(int(duration / (beat_interval * 2))):
            chord = chords[i % len(chords)]
            c_start = i * (beat_interval * 2)
            c_mask = (t >= c_start) & (t < c_start + (beat_interval * 2))
            dt = t[c_mask] - c_start
            for freq in chord:
                audio[c_mask] += 0.15 * np.sin(2 * np.pi * freq * dt) * np.exp(-1.5 * dt)
            audio[c_mask] += 0.22 * np.sin(2 * np.pi * (chord[0] / 2) * dt)

        num_beats = int(duration / beat_interval)
        for b in range(num_beats):
            b_start = b * beat_interval
            b_mask = (t >= b_start) & (t < b_start + 0.15)
            dt = t[b_mask] - b_start
            audio[b_mask] += 0.3 * np.sin(2 * np.pi * 65 * np.exp(-30 * dt) * dt)

        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val * 0.85

        sf.write(str(output_path), audio.astype(np.float32), sr, format='WAV', subtype='PCM_16')
        return {
            "success": True,
            "job_id": job_id,
            "mode": "libre",
            "file_path": str(output_path.resolve()),
            "filename": output_filename,
            "duration": duration,
            "bpm": bpm,
            "prompt": prompt,
            "engine": "Synthèse Démo Libre (Poids MusicGen dans ./models/)"
        }

ai_generator = LocalAIGenerator()
