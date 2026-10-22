import React from 'react';
import { X, HardDrive, CheckCircle2, AlertTriangle, Cpu, ShieldCheck, Folder, Sparkles } from 'lucide-react';

interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelManagerModal: React.FC<ModelManagerModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Gestion des Modèles Hors-Ligne (Dossier /models/)
              </h2>
              <p className="text-xs text-zinc-400">
                Wise Design Studio • Inférence 100% CPU Locale
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-zinc-300">
          {/* Strict Offline Rule */}
          <div className="bg-blue-950/40 p-4 rounded-xl border border-blue-800/40 space-y-1.5">
            <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Garantie Zéro Connexion Réseau</span>
            </div>
            <p className="text-zinc-300 leading-relaxed">
              L'application tourne <b>100% en local sur processeur (CPU)</b>. Aucun appel API externe (OpenAI, HuggingFace, Replicate) n'est effectué. Les modèles sont chargés exclusivement depuis votre dossier local.
            </p>
          </div>

          {/* Model 1: MusicGen Small & Melody */}
          <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white text-sm">1. Moteur Instrumental : MusicGen (Libre & Conditionné Audio)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Piste 1
              </span>
            </div>
            <p className="text-zinc-400">
              Chemins locaux pris en charge :
            </p>
            <div className="bg-black/60 p-3 rounded-lg border border-zinc-800 space-y-2 font-mono text-[11px] text-zinc-300">
              <div>
                <p className="text-amber-400 font-bold">• Mode Libre (Text-to-Music) :</p>
                <p className="text-zinc-400 pl-3">Dossier : <code className="text-amber-300">./models/musicgen-small/</code></p>
                <p className="text-zinc-500 pl-3">Fichiers : state_dict.bin (ou model.safetensors), compression_state_dict.bin</p>
              </div>
              <div>
                <p className="text-emerald-400 font-bold">• Mode Basé sur Audio Chanson (Audio-to-Music) :</p>
                <p className="text-zinc-400 pl-3">Dossier : <code className="text-emerald-300">./models/musicgen-melody/</code></p>
                <p className="text-zinc-500 pl-3">Fichiers : state_dict.bin, model.safetensors (conditionnement mélodique chroma)</p>
              </div>
            </div>
          </div>

          {/* Model 2: Demucs */}
          <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-white text-sm">2. Séparation de Pistes : Demucs</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                Pistes 3 & 4
              </span>
            </div>
            <p className="text-zinc-400">
              Chemin local requis : <code className="text-purple-300 font-mono">./models/demucs/</code>
            </p>
            <div className="bg-black/60 p-3 rounded-lg border border-zinc-800 space-y-1 font-mono text-[11px] text-zinc-300">
              <p className="text-zinc-500">Fichier requis :</p>
              <p>• htdemucs.th (modèle CPU de séparation)</p>
            </div>
          </div>

          {/* How to run offline */}
          <div className="bg-zinc-900/50 p-3.5 rounded-xl border border-zinc-800 text-zinc-400 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-200 font-bold">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Optimisation CPU :</span>
            </div>
            <p>
              Dans le code Python (<code className="text-sky-300 font-mono">backend/config.py</code>), PyTorch est configuré sur <code className="text-emerald-400 font-mono">DEVICE = "cpu"</code> avec allocation de mémoire maîtrisée pour tourner sans surchauffe même sur ordinateurs portables de studio.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
