import React, { useState } from 'react';
import { Layers, Volume2, Split, Sparkles, RefreshCw } from 'lucide-react';
import { TrackState } from '../../types/daw';
import { WaveformCanvas } from './WaveformCanvas';

interface TrackStemsProps {
  tracks: TrackState[];
  currentTime: number;
  duration: number;
  hasAnySolo: boolean;
  onUpdateTrack: (trackId: string, updates: Partial<TrackState>) => void;
  onSeparateStems: () => Promise<void>;
  isSeparating: boolean;
  canSeparate: boolean;
  onSeek: (time: number) => void;
}

export const TrackStems: React.FC<TrackStemsProps> = ({
  tracks,
  currentTime,
  duration,
  hasAnySolo,
  onUpdateTrack,
  onSeparateStems,
  isSeparating,
  canSeparate,
  onSeek
}) => {
  const [expanded, setExpanded] = useState<boolean>(true);

  if (tracks.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 overflow-hidden space-y-2">
      {/* Stem Header Banner */}
      <div className="bg-zinc-950 px-4 py-2.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <span className="font-bold text-sm text-white">PISTES 3 & 4 : Séparation de Stems (Demucs CPU)</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
            Basse • Batterie • Instruments
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSeparateStems}
            disabled={!canSeparate || isSeparating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-40"
            title="Isole la basse et la batterie sur CPU hors-ligne"
          >
            {isSeparating ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-purple-200" />
                <span>Séparation CPU en cours...</span>
              </>
            ) : (
              <>
                <Split className="w-3.5 h-3.5" />
                <span>Séparer les Stems (CPU)</span>
              </>
            )}
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 bg-zinc-900 rounded border border-zinc-800"
          >
            {expanded ? 'Réduire' : 'Afficher'}
          </button>
        </div>
      </div>

      {/* Stem Sub-Tracks List */}
      {expanded && (
        <div className="p-3 space-y-2.5">
          {tracks.map((track) => {
            const isAudible = hasAnySolo ? track.solo : !track.muted;
            const activeClip = track.clips[track.activeClipIndex] || null;

            return (
              <div
                key={track.id}
                className={`p-2.5 rounded-lg border transition-all ${
                  isAudible ? 'bg-zinc-900/80 border-zinc-700/80' : 'bg-zinc-950/60 border-zinc-800/60 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: track.color }} />
                    <span className="text-xs font-bold text-zinc-200">{track.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Mute */}
                    <button
                      onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                      className={`w-5 h-5 rounded text-[9px] font-bold ${
                        track.muted ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      M
                    </button>

                    {/* Solo */}
                    <button
                      onClick={() => onUpdateTrack(track.id, { solo: !track.solo })}
                      className={`w-5 h-5 rounded text-[9px] font-bold ${
                        track.solo ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      S
                    </button>

                    {/* Fader */}
                    <div className="flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-zinc-500" />
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={track.volume}
                        onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                        className="w-14 h-1 accent-purple-500 bg-zinc-700 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Sub-waveform */}
                <WaveformCanvas
                  buffer={activeClip?.buffer || null}
                  currentTime={currentTime}
                  duration={duration}
                  color={track.color}
                  height={44}
                  onSeek={onSeek}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
