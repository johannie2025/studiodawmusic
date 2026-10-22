# Wise Design Studio — by Maestro Josias
Studio audio (DAW) IA **hors-ligne sur CPU** : création d'instrumentaux, enregistrement des chantres, mixage, export WAV/MP3.
Contact WhatsApp : +240 222 886 007 / +240 555 593 398

## Démarrage rapide (Windows)
1. Installer Python 3.10–3.12 (cocher « Add to PATH »).
2. Double-clic sur `Lancer_Studio.bat` (1ʳᵉ fois : installation, Internet requis). Le navigateur s'ouvre sur http://127.0.0.1:8765.
3. Copier les modèles dans `models/` (voir `models/LISEZMOI.txt`). Sur un PC connecté : `pip install huggingface_hub` puis `python download_models.py --melody --demucs`, puis copier le dossier `models/` sur les PC du studio. **Aucun téléchargement n'est jamais tenté par l'appli.**
4. Linux/Mac : `./Lancer_Studio.sh`.

## Fonctions
- **DAW multipiste** : pistes illimitées, clips déplaçables/rognables/coupables (S), aimant sur les temps, zoom, annuler (Ctrl+Z), métronome, décompte, enregistrement micro sur la piste armée (●) avec compensation de latence, Mute/Solo, volume, pan, réverbération, EQ 3 bandes, compresseur, limiteur master, vu-mètres.
- **IA Musique** (MusicGen, CPU) : *Libre* (texte), *Suivre une mélodie* (depuis le clip sélectionné — ex. voix importée —, la piste, le mix complet ou un fichier ; nécessite `musicgen-melody`, sinon repli par prolongation avec `musicgen-small`), *Prolonger* un clip. Durées jusqu'à 180 s (enchaînement automatique par segments).
- **Outils IA** : séparation en stems (Demucs, optionnel), détection du BPM, mixage automatique.
- **Assistant** : pilotage du mix et de l'interface en français. Hors-ligne = commandes locales ; en ligne (Réglages) = IA gratuite via votre clé API : Groq, Gemini, OpenRouter (modèles :free), Mistral, Cerebras, ou **Ollama local** (reste hors-ligne). Les noms de modèles gratuits changent : modifiez le champ « Modèle ».
- **Export** : WAV 16 bits ou MP3 320 kbps (normalisé −1 dBFS), copie dans `outputs/exports/`. Projets dans `projects/`.

## Livrable .exe
Dans le venv : `pip install pyinstaller` puis `python build_app.py` → `dist/WiseDesignStudio/` (+ `models/`, `outputs/`). Build lourd (torch + transformers).

## Notes importantes
- Poids MusicGen (Meta) : licence **CC-BY-NC 4.0**, usage non commercial. Vérifiez avant toute exploitation commerciale.
- Sur CPU, compter plusieurs minutes pour 30 s de musique. Utilisez un casque pour enregistrer (le micro n'est pas rebouclé).
- Ce code a été testé côté serveur (import/export, MP3, assistant, projets) ; la génération avec les vrais poids et le .exe PyInstaller doivent être validés sur votre machine.
