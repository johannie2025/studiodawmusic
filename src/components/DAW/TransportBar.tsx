import React, { useState } from 'react';
import { Play, Pause, Square, Circle, RotateCcw, Volume2, Clock, Bell, Repeat } from 'lucide-react';

interface TransportBarProps {
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onToggleLoop: () => void;
  isLooping: boolean;
  onToggleMetronome: () => void;
  isMetronomeActive: boolean;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  isRecording,
  currentTime,
  duration,
  bpm,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onToggleLoop,
  isLooping,
  onToggleMetronome,
  isMetronomeActive
}) => {
  // Format seconds to mm:ss.ms
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-zinc-950 border-t border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky bottom-0 z-40 shadow-2xl">
      {/* Left: Timecode Display */}
      <div className="flex items-center gap-3">
        <div className="bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400" />
          <span className="font-mono text-base font-bold text-white tracking-wider">
            {formatTime(currentTime)}
          </span>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="font-mono text-xs text-zinc-400">
            {formatTime(duration)}
          </span>
        </div>

        {/* BPM readout */}
        <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-xs">
          <span className="text-zinc-500 font-bold">BPM:</span>
          <span className="font-mono font-bold text-blue-400">{bpm}</span>
        </div>
      </div>

      {/* Center: Main Transport Buttons */}
      <div className="flex items-center gap-2">
        {/* Rewind / Stop to zero */}
        <button
          onClick={onStop}
          className="w-10 h-10 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center border border-zinc-800 transition-colors"
          title="Arrêt et retour à zéro"
        >
          <Square className="w-4 h-4 fill-current" />
        </button>

        {/* Play / Pause Toggle */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 transition-transform active:scale-95"
          title={isPlaying ? "Pause" : "Lecture synchrone"}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </button>

        {/* Record (REC) */}
        <button
          onClick={onRecord}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-600 text-white animate-pulse shadow-md shadow-red-600/50'
              : 'bg-zinc-900 hover:bg-zinc-800 text-red-500 border border-zinc-800'
          }`}
          title="Enregistrement Chantres (REC)"
        >
          <Circle className="w-4 h-4 fill-current" />
        </button>
      </div>

      {/* Right: Studio Utilities (Loop, Metronome) */}
      <div className="flex items-center gap-2">
        {/* Metronome */}
        <button
          onClick={onToggleMetronome}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
            isMetronomeActive
              ? 'bg-blue-950/70 border-blue-500/50 text-blue-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Métronome audio"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Métronome</span>
        </button>

        {/* Loop */}
        <button
          onClick={onToggleLoop}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
            isLooping
              ? 'bg-sky-950/70 border-sky-500/50 text-sky-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Boucler la lecture"
        >
          <Repeat className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Boucle</span>
        </button>
      </div>
    </div>
  );
};
