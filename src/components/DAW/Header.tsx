import React from 'react';
import { BrandLogo } from './BrandLogo';
import { Download, Cpu, HardDrive, HelpCircle, Volume2, ShieldCheck, Github } from 'lucide-react';

interface HeaderProps {
  onOpenGitHubModal: () => void;
  onOpenModelModal: () => void;
  onDirectZipDownload: () => void;
  isDownloadingZip: boolean;
  masterVolume: number;
  onMasterVolumeChange: (val: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenGitHubModal,
  onOpenModelModal,
  onDirectZipDownload,
  isDownloadingZip,
  masterVolume,
  onMasterVolumeChange
}) => {
  return (
    <header className="bg-zinc-950/90 backdrop-blur border-b border-zinc-800/80 px-3 sm:px-6 py-2.5 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3">
      {/* Left: Brand Logo */}
      <BrandLogo />

      {/* Center: System Status Badges */}
      <div className="flex items-center gap-2 text-xs">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-medium">Moteur IA :</span>
          <span className="text-emerald-400 font-semibold">100% CPU Offline</span>
        </div>

        <button
          onClick={onOpenModelModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all text-xs"
          title="Gérer les poids locaux dans ./models/"
        >
          <HardDrive className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Dossier :</span>
          <span className="font-mono text-zinc-200">/models/</span>
        </button>
      </div>

      {/* Right: Master Output Volume & GitHub Actions Export CTA */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Master Output Level */}
        <div className="hidden md:flex items-center gap-2 bg-zinc-900/90 px-2.5 py-1 rounded-md border border-zinc-800">
          <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="w-16 h-1.5 accent-blue-500 bg-zinc-700 rounded-lg cursor-pointer"
            title={`Volume Master: ${Math.round(masterVolume * 100)}%`}
          />
          <span className="text-[11px] font-mono text-zinc-400 w-8 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        {/* Action: Open GitHub Actions Tutorial & File Inspector */}
        <button
          onClick={onOpenGitHubModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white text-xs font-medium transition-all shadow-sm"
          title="Voir le workflow GitHub Actions et les scripts de build .exe"
        >
          <Github className="w-3.5 h-3.5 text-zinc-300" />
          <span className="hidden sm:inline">GitHub Actions</span>
          <span className="text-zinc-500 text-[10px]">(.exe)</span>
        </button>

        {/* Primary CTA: Download ZIP for GitHub Actions (.exe) */}
        <button
          onClick={onDirectZipDownload}
          disabled={isDownloadingZip}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 hover:from-blue-500 hover:via-sky-500 hover:to-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/25 border border-sky-400/30 disabled:opacity-50"
        >
          <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
          <span>{isDownloadingZip ? 'Génération du ZIP...' : 'Télécharger le ZIP (.exe)'}</span>
        </button>
      </div>
    </header>
  );
};
