# Dossier Local des Modèles IA (100% Hors-Ligne CPU)

Ce dossier `/models/` est le répertoire exclusif depuis lequel l'application charge les modèles d'intelligence artificielle en local sur processeur (CPU).

## 1. Modèle Instrumental : `musicgen-small`
Placez les fichiers du modèle dans le sous-dossier :
`/models/musicgen-small/`

Fichiers acceptés :
- `state_dict.bin`
- `compression_state_dict.bin`
- `model.safetensors`
- `config.json`

## 2. Modèle Séparation de Pistes : `demucs`
Placez le modèle dans le sous-dossier :
`/models/demucs/`
- `htdemucs.th`

## Règle Absolue :
L'application ne contacte jamais HuggingFace ou OpenAI à l'exécution. Si un fichier est manquant, l'interface utilisateur affichera le nom exact du fichier à déposer dans ce dossier.
