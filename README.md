# Wise Design Studio by Maestro Josias
### DAW IA Pro Standalone (Édition 100% Hors-Ligne CPU)
**Contact WhatsApp :** +240 222 886 007 / +240 555 593 398  
*"L'architecture et l'innovations qui donnent vie à vos idées !"*

---

## 🎵 Présentation du Projet
Ce projet est une station audio numérique (DAW) IA complète dérivée de l'architecture de **Milimo Music**, spécialement adaptée pour fonctionner **100% hors-ligne**, sur **processeur (CPU)** et sans dépendance au cloud.

Elle est conçue spécifiquement pour le studio :
1. **Piste 1 (Instrumental IA - 2 Modes Intégrés)** :
   - **Mode Libre (Text-to-Music)** : Génération textuelle directe d'instrumentaux (Gospel traditionnel Bikutsi 170 BPM, Makossa, Praise & Worship, Afro-Gospel) via **MusicGen-Small** sur CPU.
   - **Mode Basé sur l'Audio de la Chanson (Audio-to-Music)** : Importation d'une chanson existante (MP3/WAV) ou utilisation directe de la voix enregistrée du chantre sur la Piste 2 pour composer un arrangement instrumental complet qui suit fidèlement la mélodie, les accords et le tempo de l'audio source.
2. **Piste 2 (Enregistrement Chantres)** : Capture micro directe des voix des chantres en lecture synchrone avec retour casque de la Piste 1.
3. **Pistes 3 & 4 (Stems)** : Séparation de pistes (Basse, Batterie, Chœurs) via **Demucs/BS-Roformer** sur CPU depuis `./models/demucs/`.
4. **Console de Mixage** : Égaliseur 3-Bandes, Réverbération de studio, Faders, Panoramiques et bouton d'export direct en fichier WAV 16-bit.

---

## 🚀 Compilation Windows `.EXE` avec GitHub Actions

Vous n'avez pas besoin d'un PC puissant ni d'outils C++ lourds pour compiler l'application :

1. Cliquez sur le bouton **"📥 Télécharger le ZIP pour GitHub Actions"** dans l'application.
2. Créez un nouveau dépôt sur [GitHub](https://github.com).
3. Poussez le code décompressé :
   ```bash
   git init
   git add .
   git commit -m "Wise Design Studio DAW IA Pro Standalone"
   git branch -M main
   git remote add origin https://github.com/VOTRE_COMPTE/VOTRE_DEPOT.git
   git push -u origin main
   ```
4. Ouvrez l'onglet **Actions** sur votre GitHub : le workflow `.github/workflows/build-windows-exe.yml` démarre automatiquement sur un serveur virtuel Windows.
5. Une fois terminé, téléchargez l'archive **`MonStudio-DAW-IA-Windows-x64.zip`** dans la section **Artifacts**.

---

## 📁 Structure de l'Exécutable Windows Distribué

```text
MonStudioChantres/
│
├── MonStudio.exe            # 🚀 Double-cliquez pour démarrer la station
├── _internal/               # 📦 Dépendances Python, PyTorch CPU et bibliothèques C++
├── models/                  # 🧠 DOSSIER CLÉ (déposez vos poids de modèles ici)
│   ├── musicgen-small/      # (state_dict.bin ou .safetensors)
│   └── demucs/              # (htdemucs.th)
└── outputs/                 # 🎵 Dossier de vos instrumentaux et voix enregistrées
```

---

## 🛡️ Contraintes Techniques Strictes
- **CPU Forcé** : `DEVICE = "cpu"` dans `backend/config.py`.
- **Mode 100% Hors-Ligne** : Variables `HF_HUB_OFFLINE = 1`, aucune requête cloud.
- **Dossier local obligatoire** : Si un modèle est manquant, l'interface affiche explicitement le fichier attendu dans `./models/`.
