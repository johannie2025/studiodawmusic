import React, { useState } from 'react';
import { X, Download, Github, FileCode, Check, Copy, Terminal, PackageCheck, AlertCircle, Sparkles, Phone } from 'lucide-react';
import { generateAndDownloadProjectZip, downloadBlob, downloadTextFile } from '../../utils/zipExporter';

interface GitHubActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WORKFLOW_YAML = `name: Build Windows EXE (DAW IA Pro Standalone)

on:
  push:
    branches: [ main, master ]
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-windows:
    name: Compilation Windows x64 (PyInstaller Standalone)
    runs-on: windows-latest

    steps:
      - name: 📥 Récupération du code source
        uses: actions/checkout@v4

      - name: 🐍 Configuration de Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
          cache: 'pip'

      - name: ⚡ Configuration de Node.js pour le Frontend DAW
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: 📦 Installation des dépendances Frontend & Compilation Vite
        run: |
          npm ci || npm install
          npm run build

      - name: 🔧 Installation des dépendances Python (CPU-only PyTorch & AudioCraft)
        run: |
          python -m pip install --upgrade pip setuptools wheel
          pip install torch==2.2.2+cpu torchaudio==2.2.2+cpu --extra-index-url https://download.pytorch.org/whl/cpu
          pip install -r requirements.txt
          pip install pyinstaller

      - name: 🏗️ Compilation de l'exécutable MonStudio.exe
        run: |
          python build_app.py

      - name: 📁 Vérification de l'arborescence finale (_internal, models, outputs)
        shell: bash
        run: |
          ls -la dist/MonStudioChantres/
          find dist/MonStudioChantres/ -maxdepth 2

      - name: 🗜️ Compression du package Windows
        shell: bash
        run: |
          cd dist
          7z a -tzip MonStudio-DAW-IA-Windows-x64.zip MonStudioChantres/
          cd ..

      - name: 🚀 Publication de l'Artefact GitHub Actions
        uses: actions/upload-artifact@v4
        with:
          name: MonStudio-DAW-IA-Windows-x64
          path: dist/MonStudio-DAW-IA-Windows-x64.zip
          retention-days: 30
`;

const BUILD_APP_PY = `"""
Script PyInstaller Standalone - Wise Design Studio by Maestro Josias
Génère le dossier de distribution Windows final :
MonStudioChantres/
├── MonStudio.exe            # Exécutable autonome
├── _internal/               # Dépendances Python, PyTorch CPU et DLL
├── models/                  # Poids locaux hors-ligne
│   └── musicgen-small/
└── outputs/                 # Exportations audio
"""

import sys
import shutil
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
DIST = BASE / "dist"
FINAL_DIR = DIST / "MonStudioChantres"

def build():
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "MonStudio",
        "--onedir",            # Indispensable pour créer le sous-dossier _internal/
        "--windowed",          # Mode sans invite de commande noir
        "--noconfirm",
        "--clean",
        "backend/main.py",
    ]
    print("Exécution de PyInstaller :", " ".join(cmd))
    subprocess.run(cmd, cwd=str(BASE), check=True)

    # Réorganisation du dossier final
    if FINAL_DIR.exists():
        shutil.rmtree(FINAL_DIR)
    shutil.move(str(DIST / "MonStudio"), str(FINAL_DIR))

    # Création des dossiers models et outputs requis
    (FINAL_DIR / "models" / "musicgen-small").mkdir(parents=True, exist_ok=True)
    (FINAL_DIR / "models" / "demucs").mkdir(parents=True, exist_ok=True)
    (FINAL_DIR / "outputs").mkdir(parents=True, exist_ok=True)
    print("Package prêt dans :", FINAL_DIR)

if __name__ == "__main__":
    build()
`;

export const GitHubActionsModal: React.FC<GitHubActionsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'tutorial' | 'workflow' | 'buildscript'>('tutorial');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadZip = async () => {
    try {
      setIsExporting(true);
      setExportProgress(30);
      const res = await fetch('/Wise-Design-Studio-DAW-IA-Complete.zip');
      if (res.ok) {
        setExportProgress(90);
        const blob = await res.blob();
        downloadBlob(blob, 'Wise-Design-Studio-DAW-IA-Complete.zip');
        return;
      }
      const blob = await generateAndDownloadProjectZip((progress) => {
        setExportProgress(Math.round(progress));
      });
      downloadBlob(blob, 'Wise-Design-Studio-DAW-IA-Complete.zip');
    } catch (err) {
      console.error("Erreur lors de la récupération du ZIP :", err);
      try {
        const blob = await generateAndDownloadProjectZip((progress) => {
          setExportProgress(Math.round(progress));
        });
        downloadBlob(blob, 'Wise-Design-Studio-DAW-IA-Complete.zip');
      } catch (e) {
        alert("Erreur lors de la génération du ZIP. Veuillez réessayer.");
      }
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleDownloadSingleWorkflow = () => {
    downloadTextFile(WORKFLOW_YAML, 'build-windows-exe.yml');
  };

  const handleDownloadSingleBuildScript = () => {
    downloadTextFile(BUILD_APP_PY, 'build_app.py');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Déploiement GitHub Actions & Compilation .EXE
              </h2>
              <p className="text-xs text-zinc-400">
                Wise Design Studio by Maestro Josias • WhatsApp: +240222886007 / +240555593398
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Big Download ZIP & Direct File Actions Banner */}
        <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 p-4 sm:p-5 border-b border-blue-900/40 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <PackageCheck className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-sm text-white">Archive Complète pour GitHub Actions</span>
              </div>
              <p className="text-xs text-zinc-300 max-w-xl">
                Contient le workflow <code className="text-sky-300 font-mono">build-windows-exe.yml</code>, le backend Python CPU, PyInstaller et l'interface DAW.
              </p>
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={isExporting}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-sm transition-all shadow-xl shadow-blue-600/30 border border-sky-400/40 disabled:opacity-50 shrink-0"
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>
                {isExporting ? `Génération (${exportProgress}%)...` : "Télécharger le ZIP Complet (.zip)"}
              </span>
            </button>
          </div>

          {/* Quick Direct Downloads for Single Files */}
          <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-zinc-400 font-medium">
              Téléchargements directs des fichiers individuels :
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadSingleWorkflow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-sky-300 hover:text-white font-semibold transition-all shadow-sm"
                title="Télécharge uniquement build-windows-exe.yml"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Télécharger build-windows-exe.yml</span>
              </button>

              <button
                onClick={handleDownloadSingleBuildScript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-emerald-300 hover:text-white font-semibold transition-all shadow-sm"
                title="Télécharge uniquement build_app.py"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Télécharger build_app.py</span>
              </button>
            </div>
          </div>
        </div>

        {/* Visibility Info Callout */}
        <div className="bg-amber-950/30 border-b border-amber-900/30 px-5 py-2 text-[11px] text-amber-200/90 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <b>Astuce Windows :</b> Les dossiers commençant par un point (comme <code className="font-mono bg-amber-900/40 px-1 rounded">.github/</code>) peuvent être masqués par défaut dans Windows Explorer. Le fichier de build est donc dupliqué à la racine (<code className="font-mono bg-amber-900/40 px-1 rounded">build-windows-exe.yml</code>) et dans <code className="font-mono bg-amber-900/40 px-1 rounded">FICHIERS_BUILD_ACTIONS/</code>.
          </span>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-5 gap-4 text-xs font-semibold text-zinc-400">
          <button
            onClick={() => setActiveTab('tutorial')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'tutorial' ? 'border-blue-500 text-blue-400' : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Guide Pas-à-Pas (3 min)</span>
          </button>

          <button
            onClick={() => setActiveTab('workflow')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'workflow' ? 'border-blue-500 text-blue-400' : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Workflow GitHub (.yml)</span>
          </button>

          <button
            onClick={() => setActiveTab('buildscript')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'buildscript' ? 'border-blue-500 text-blue-400' : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Script PyInstaller (build_app.py)</span>
          </button>
        </div>

        {/* Modal Content Area */}
        <div className="flex-1 overflow-y-auto p-5 text-sm text-zinc-300">
          {activeTab === 'tutorial' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                    1
                  </div>
                  <h3 className="font-bold text-white text-sm">Télécharger le ZIP</h3>
                  <p className="text-xs text-zinc-400">
                    Cliquez sur le bouton ci-dessus pour obtenir l'archive complète avec tous les scripts et configurations.
                  </p>
                </div>

                <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-xs">
                    2
                  </div>
                  <h3 className="font-bold text-white text-sm">Créer & Pousser sur GitHub</h3>
                  <p className="text-xs text-zinc-400">
                    Créez un dépôt sur GitHub et envoyez les fichiers décompressés via le terminal.
                  </p>
                </div>

                <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                    3
                  </div>
                  <h3 className="font-bold text-white text-sm">Récupérer MonStudio.exe</h3>
                  <p className="text-xs text-zinc-400">
                    GitHub Actions compile automatiquement et fournit le fichier zip contenant l'exécutable dans <b>Artifacts</b> !
                  </p>
                </div>
              </div>

              {/* Terminal command snippets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                  <span>Commandes Git à exécuter dans votre dossier décompressé :</span>
                  <button
                    onClick={() => handleCopy("git init\ngit add .\ngit commit -m \"Wise Design Studio DAW IA Pro\"\ngit branch -M main\ngit remote add origin https://github.com/VOTRE_COMPTE/VOTRE_DEPOT.git\ngit push -u origin main", "git")}
                    className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs"
                  >
                    {copiedKey === 'git' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'git' ? 'Copié !' : 'Copier tout'}</span>
                  </button>
                </div>

                <div className="bg-black/90 p-3.5 rounded-xl border border-zinc-800 font-mono text-xs text-emerald-400 space-y-1 overflow-x-auto">
                  <p className="text-zinc-500"># 1. Initialiser le dépôt</p>
                  <p>git init</p>
                  <p>git add .</p>
                  <p>git commit -m "Wise Design Studio DAW IA Pro"</p>
                  <p>git branch -M main</p>
                  <p className="text-zinc-500"># 2. Lier à votre dépôt GitHub et envoyer</p>
                  <p>git remote add origin https://github.com/VOTRE_PSEUDO/daw-ia-chantres.git</p>
                  <p>git push -u origin main</p>
                </div>
              </div>

              {/* Expected Output Tree */}
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
                <h4 className="font-bold text-white text-xs uppercase tracking-wide">
                  Arborescence Windows finale générée par GitHub Actions :
                </h4>
                <pre className="font-mono text-xs text-zinc-300 bg-black/60 p-3 rounded-lg border border-zinc-800 overflow-x-auto">
{`MonStudioChantres/
├── MonStudio.exe            # 🚀 Double-cliquez pour démarrer la station
├── _internal/               # 📦 Dépendances Python, PyTorch CPU et bibliothèques C++
├── models/                  # 🧠 DOSSIER CLÉ (déposez vos modèles IA hors-ligne ici)
│   ├── musicgen-small/      # (state_dict.bin ou .safetensors)
│   └── demucs/              # (htdemucs.th)
└── outputs/                 # 🎵 Enregistrements des chantres et exports WAV`}
                </pre>
              </div>

              {/* Direct support footer */}
              <div className="flex items-center justify-between bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 text-xs text-zinc-400">
                <span>Support & Assistance Studio :</span>
                <a
                  href="https://wa.me/240222886007"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5" />
                  WhatsApp Maestro Josias (+240222886007 / +240555593398)
                </a>
              </div>
            </div>
          )}

          {activeTab === 'workflow' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-zinc-400">.github/workflows/build-windows-exe.yml</span>
                <button
                  onClick={() => handleCopy(WORKFLOW_YAML, 'workflow')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
                >
                  {copiedKey === 'workflow' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'workflow' ? 'Copié !' : 'Copier le code'}</span>
                </button>
              </div>
              <pre className="p-4 bg-black/90 rounded-xl border border-zinc-800 font-mono text-xs text-sky-300 overflow-x-auto max-h-[50vh]">
                {WORKFLOW_YAML}
              </pre>
            </div>
          )}

          {activeTab === 'buildscript' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-zinc-400">build_app.py</span>
                <button
                  onClick={() => handleCopy(BUILD_APP_PY, 'build')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
                >
                  {copiedKey === 'build' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'build' ? 'Copié !' : 'Copier le script'}</span>
                </button>
              </div>
              <pre className="p-4 bg-black/90 rounded-xl border border-zinc-800 font-mono text-xs text-emerald-300 overflow-x-auto max-h-[50vh]">
                {BUILD_APP_PY}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
