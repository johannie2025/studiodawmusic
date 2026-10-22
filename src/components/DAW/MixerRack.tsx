import React, { useState } from 'react';
import { Sliders, Download, Sparkles, Volume2, Music, Waves, CheckCircle2, RefreshCw } from 'lucide-react';
import { TrackState } from '../../types/daw';

interface MixerRackProps {
  tracks: TrackState[];
  onUpdateTrack: (trackId: string, updates: Partial<TrackState>) => void;
  masterVolume: number;
  onMasterVolumeChange: (val: number) => void;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  onEQChange: (low: number, mid: number, high: number) => void;
  reverbLevel: number;
  onReverbChange: (val: number) => void;
  onExportMix: (format: 'wav' | 'mp3') => Promise<void>;
  isExporting: boolean;
  canExport: boolean;
}

export const MixerRack: React.FC<MixerRackProps> = ({
  tracks,
  onUpdateTrack,
  masterVolume,
  onMasterVolumeChange,
  eqLow,
  eqMid,
  eqHigh,
  onEQChange,
  reverbLevel,
  onReverbChange,
  onExportMix,
  isExporting,
  canExport
}) => {
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('mp3');

  return (
    <div className="bg-zinc-950/95 border border-zinc-800 rounded-xl p-4 space-y-4 shadow-xl">
      {/* Rack Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="font-extrabold text-sm text-zinc-100 tracking-wide uppercase">
            Console de Mixage Studio & Traitement Master
          </span>
          <span className="text-[11px] text-zinc-500">
            • Wise Design Studio
          </span>
        </div>

        {/* Master Export Section with Format Toggle (WAV / MP3) */}
        <div className="flex items-center gap-2">
          {/* Format Selector Pills */}
          <div className="bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 flex items-center text-xs">
            <button
              onClick={() => setExportFormat('mp3')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                exportFormat === 'mp3'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Format MP3 haute qualité compressé pour partage WhatsApp et web"
            >
              MP3 (320k)
            </button>
            <button
              onClick={() => setExportFormat('wav')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                exportFormat === 'wav'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Format WAV Master non compressé haute fidélité studio"
            >
              WAV (16-bit)
            </button>
          </div>

          {/* Master Export Button */}
          <button
            onClick={() => onExportMix(exportFormat)}
            disabled={!canExport || isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs transition-all shadow-md shadow-emerald-700/20 disabled:opacity-40 border border-emerald-400/30"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Rendu {exportFormat.toUpperCase()} en cours...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Exporter le Mix ({exportFormat.toUpperCase()})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Track Strips + Master Section */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Track Channel Strips (Instru vs Voix vs Stems) */}
        <div className="md:col-span-7 bg-zinc-900/60 p-3 rounded-lg border border-zinc-850 flex flex-wrap sm:flex-nowrap gap-3 items-stretch justify-around">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex-1 min-w-[100px] bg-zinc-950/80 p-2.5 rounded border border-zinc-800 flex flex-col items-center justify-between gap-2"
            >
              {/* Channel Label */}
              <div className="text-center">
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                  style={{ backgroundColor: `${track.color}25`, color: track.color }}
                >
                  {track.type === 'instrumental' ? 'P1 Instru' : track.type === 'vocal' ? 'P2 Voix' : track.name}
                </span>
                <p className="text-[10px] text-zinc-400 truncate max-w-[80px] mt-0.5">
                  {track.name}
                </p>
              </div>

              {/* Rotary / Send dials simulation */}
              <div className="w-full space-y-1.5 text-[9px] text-zinc-400">
                <div className="flex items-center justify-between">
                  <span className="text-sky-400">REV</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={track.reverbSend}
                    onChange={(e) => onUpdateTrack(track.id, { reverbSend: parseFloat(e.target.value) })}
                    className="w-12 h-1 accent-sky-400 bg-zinc-800 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>PAN</span>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={track.pan}
                    onChange={(e) => onUpdateTrack(track.id, { pan: parseFloat(e.target.value) })}
                    className="w-12 h-1 accent-zinc-400 bg-zinc-800 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Vertical Fader */}
              <div className="flex flex-col items-center h-28 justify-center relative">
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={track.volume}
                  onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  className="accent-blue-500 bg-zinc-800 rounded cursor-pointer transform -rotate-90 w-24 origin-center"
                />
              </div>

              {/* Mute & Solo Buttons */}
              <div className="flex items-center gap-1 w-full justify-center">
                <button
                  onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                  className={`w-6 h-5 rounded text-[9px] font-bold ${
                    track.muted ? 'bg-amber-600 text-white' : 'bg-zinc-850 text-zinc-400'
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => onUpdateTrack(track.id, { solo: !track.solo })}
                  className={`w-6 h-5 rounded text-[9px] font-bold ${
                    track.solo ? 'bg-blue-600 text-white' : 'bg-zinc-850 text-zinc-400'
                  }`}
                >
                  S
                </button>
              </div>

              {/* dB indicator */}
              <span className="font-mono text-[9px] text-zinc-400">
                {Math.round(track.volume * 100)}%
              </span>
            </div>
          ))}
        </div>

        {/* Master Equalizer & Studio Reverb & Limiter */}
        <div className="md:col-span-5 bg-zinc-900/60 p-3 rounded-lg border border-zinc-850 space-y-3">
          {/* 3-Band Parametric EQ */}
          <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-blue-400" />
                Égaliseur Master 3-Bandes
              </span>
              <button
                onClick={() => onEQChange(0, 0, 0)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-400">
              {/* Low */}
              <div className="space-y-1">
                <span>Basses (100Hz)</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eqLow}
                  onChange={(e) => onEQChange(parseFloat(e.target.value), eqMid, eqHigh)}
                  className="w-full h-1.5 accent-blue-400 bg-zinc-800 rounded cursor-pointer"
                />
                <span className="font-mono text-zinc-300">{eqLow > 0 ? `+${eqLow}` : eqLow} dB</span>
              </div>

              {/* Mid */}
              <div className="space-y-1">
                <span>Médiums (1.2kHz)</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eqMid}
                  onChange={(e) => onEQChange(eqLow, parseFloat(e.target.value), eqHigh)}
                  className="w-full h-1.5 accent-sky-400 bg-zinc-800 rounded cursor-pointer"
                />
                <span className="font-mono text-zinc-300">{eqMid > 0 ? `+${eqMid}` : eqMid} dB</span>
              </div>

              {/* High */}
              <div className="space-y-1">
                <span>Aigus (8.5kHz)</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eqHigh}
                  onChange={(e) => onEQChange(eqLow, eqMid, parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-indigo-400 bg-zinc-800 rounded cursor-pointer"
                />
                <span className="font-mono text-zinc-300">{eqHigh > 0 ? `+${eqHigh}` : eqHigh} dB</span>
              </div>
            </div>
          </div>

          {/* Master Reverb & Master Output */}
          <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800 flex items-center justify-between gap-4 text-xs">
            {/* Reverb Send */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-zinc-300">
                <span className="font-semibold text-[11px] text-sky-400">Réverb Studio Master</span>
                <span className="font-mono text-[10px] text-zinc-400">{Math.round(reverbLevel * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={reverbLevel}
                onChange={(e) => onReverbChange(parseFloat(e.target.value))}
                className="w-full h-1.5 accent-sky-400 bg-zinc-800 rounded cursor-pointer"
              />
            </div>

            {/* Master Fader */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-zinc-300">
                <span className="font-semibold text-[11px] text-emerald-400">Master Level</span>
                <span className="font-mono text-[10px] text-zinc-400">{Math.round(masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={masterVolume}
                onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 accent-emerald-400 bg-zinc-800 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
