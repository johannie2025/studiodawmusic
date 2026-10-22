import React from 'react';
import { Phone, Sparkles, Cpu, ShieldCheck } from 'lucide-react';

interface BrandLogoProps {
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false }) => {
  return (
    <div className="flex items-center gap-3 select-none">
      {/* 3D Chrome & Blue Globe Emblem inspired by user image */}
      <div className="relative group">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-400 via-blue-700 to-indigo-950 p-[2px] shadow-lg shadow-blue-500/30 flex items-center justify-center relative overflow-hidden border border-blue-300/40">
          {/* Globe grid lines simulation */}
          <div className="absolute inset-0 rounded-full opacity-40 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.8),transparent_60%)]" />
          <svg className="w-full h-full text-blue-200/40 absolute inset-0" viewBox="0 0 100 100">
            <ellipse cx="50" cy="50" rx="45" ry="20" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="50" cy="50" rx="20" ry="45" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          
          {/* Metallic 3D "W" Symbol */}
          <div className="relative z-10 font-black tracking-tighter text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center justify-center">
            W
          </div>

          {/* Gloss sheen shine */}
          <div className="absolute -top-3 -right-3 w-8 h-8 bg-white/30 rounded-full blur-[2px]" />
        </div>
        <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-[9px] font-bold text-white px-1 rounded-full border border-zinc-900 shadow">
          CPU
        </div>
      </div>

      {/* Brand Names & Titles */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
            <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
              Wise Design
            </span>
            <span className="text-zinc-300 font-semibold text-sm sm:text-base">Studio</span>
          </span>
          <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Sparkles className="w-2.5 h-2.5" /> by Maestro Josias
          </span>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-400 mt-0.5">
            <span className="text-sky-400 font-medium hidden sm:inline">
              Agence d'Architecture • Design • Innovation
            </span>
            <span className="hidden sm:inline text-zinc-600">•</span>
            <a 
              href="https://wa.me/240222886007" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors font-medium bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20"
              title="Contacter sur WhatsApp"
            >
              <Phone className="w-2.5 h-2.5" />
              WhatsApp: +240 222 886 007 / +240 555 593 398
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
