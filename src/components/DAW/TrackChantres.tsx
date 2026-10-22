import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Circle, Square, Volume2, Sparkles, RefreshCw, Trash2, Headphones, Activity } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { TrackState } from '../../types/daw';
import { audioEngine } from '../../utils/audioEngine';

interface TrackChantresProps {
  track: TrackState;
  currentTime: number;
  duration: number;
  hasAnySolo: boolean;
  onUpdateTrack: (updates: Partial<TrackState>) => void;
  onStartSynchronousRecording: (chantreName: string) => Promise<void>;
  onStopRecording: () => Promise<void>;
  isRecording: boolean;
  hasInstrumentalLoaded: boolean;
  onSeek: (time: number) => void;
  onDeleteClip: () => void;
}

export const TrackChantres: React.FC<TrackChantresProps> = ({
  track,
  currentTime,
  duration,
  hasAnySolo,
  onUpdateTrack,
  onStartSynchronousRecording,
  onStopRecording,
  isRecording,
  hasInstrumentalLoaded,
  onSeek,
  onDeleteClip
}) => {
  const [micActive, setMicActive] = useState<boolean>(false);
  const [chantreName, setChantreName] = useState<string>("Chantre Josias");
  const [micLevel, setMicLevel] = useState<number>(0);
  const animFrameRef = useRef<number | null>(null);

  const activeClip = track.clips[track.activeClipIndex] || null;
  const isAudible = hasAnySolo ? track.solo : !track.muted;

  // Toggle Microphone
  const handleToggleMic = async () => {
    if (micActive) {
      audioEngine.stopMicrophone();
      setMicActive(false);
      setMicLevel(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      const ok = await audioEngine.startMicrophone();
      if (ok) {
        setMicActive(true);
        startVUAnalyzer();
      } else {
        alert("Impossible d'accéder au microphone. Veuillez autoriser l'accès micro dans votre navigateur.");
      }
    }
  };

  // Monitor microphone volume level for live VU meter
  const startVUAnalyzer = () => {
    const analyser = audioEngine.getMicAnalyser();
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      setMicLevel(Math.min(100, (avg / 128) * 100));
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioEngine.stopMicrophone();
    };
  }, []);

  const handleRecordToggle = async () => {
    if (isRecording) {
      await onStopRecording();
    } else {
      if (!micActive) {
        const ok = await audioEngine.startMicrophone();
        if (ok) {
          setMicActive(true);
          startVUAnalyzer();
        } else {
          alert("Veuillez autoriser le micro avant d'enregistrer.");
          return;
        }
      }
      await onStartSynchronousRecording(chantreName);
    }
  };

  return (
    <div className={`rounded-xl border transition-all ${
      isAudible ? 'bg-zinc-900/90 border-emerald-500/40 shadow-md shadow-emerald-950/20' : 'bg-zinc-950/80 border-zinc-800/80 opacity-70'
    } overflow-hidden`}>
      {/* Track Header / Controls */}
      <div className="bg-zinc-950/80 px-4 py-2.5 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
            P2
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">PISTE 2 : Enregistrement Chantres</span>
              {isRecording && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                  <Circle className="w-2 h-2 fill-red-500" /> REC EN DIRECT
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              Prise de voix chantres synchrone avec retour casque de la Piste 1
            </p>
          </div>
        </div>

        {/* Mixer Faders for Track 2 */}
        <div className="flex items-center gap-2 sm:gap-3 bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800">
          {/* Mute */}
          <button
            onClick={() => onUpdateTrack({ muted: !track.muted })}
            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${
              track.muted ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Mute Track 2"
          >
            M
          </button>

          {/* Solo */}
          <button
            onClick={() => onUpdateTrack({ solo: !track.solo })}
            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${
              track.solo ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Solo Track 2"
          >
            S
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={track.volume}
              onChange={(e) => onUpdateTrack({ volume: parseFloat(e.target.value) })}
              className="w-16 h-1.5 accent-emerald-500 bg-zinc-700 rounded-lg cursor-pointer"
              title={`Volume Voix: ${Math.round(track.volume * 100)}%`}
            />
            <span className="font-mono text-[10px] w-7 text-right">
              {Math.round(track.volume * 100)}%
            </span>
          </div>

          {/* Pan */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-400">
            <span className="text-[10px] font-semibold text-zinc-500">PAN</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.1"
              value={track.pan}
              onChange={(e) => onUpdateTrack({ pan: parseFloat(e.target.value) })}
              className="w-12 h-1.5 accent-emerald-500 bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Reverb Send pour la Voix */}
          <div className="hidden md:flex items-center gap-1 text-[11px] text-zinc-400">
            <span className="text-[10px] font-semibold text-emerald-400">REV</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={track.reverbSend}
              onChange={(e) => onUpdateTrack({ reverbSend: parseFloat(e.target.value) })}
              className="w-12 h-1.5 accent-emerald-400 bg-zinc-700 rounded-lg cursor-pointer"
              title={`Réverb Voix: ${Math.round(track.reverbSend * 100)}%`}
            />
          </div>
        </div>
      </div>

      {/* Main Studio Recording Deck */}
      <div className="p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800">
          {/* Microphone Activation & VU Meter */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleMic}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                micActive
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-900/30'
                  : 'bg-zinc-800 hover:bg-zinc-750 border-zinc-700 text-zinc-300'
              }`}
            >
              {micActive ? (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span>Microphone Actif</span>
                </>
              ) : (
                <>
                  <MicOff className="w-4 h-4 text-zinc-400" />
                  <span>Activer Microphone</span>
                </>
              )}
            </button>

            {/* Live LED Level Meter */}
            <div className="flex items-center gap-1 bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800">
              <Activity className="w-3.5 h-3.5 text-zinc-500" />
              <div className="w-24 sm:w-32 h-2.5 bg-zinc-800 rounded-full overflow-hidden flex p-[1px]">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    micLevel > 80 ? 'bg-red-500' : micLevel > 45 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${micActive ? micLevel : 0}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-zinc-400 w-8 text-right">
                {micActive ? `${Math.round(micLevel)}%` : '--'}
              </span>
            </div>
          </div>

          {/* Chantre Name Tag & Record Trigger Button */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chantreName}
              onChange={(e) => setChantreName(e.target.value)}
              placeholder="Nom du chantre..."
              className="bg-zinc-900 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 w-36 focus:outline-none focus:border-emerald-500"
              title="Nom ou rôle du chantre pour l'export"
            />

            {/* Main REC Button */}
            <button
              onClick={handleRecordToggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-md active:scale-95 ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-red-600/40'
                  : 'bg-red-600/90 hover:bg-red-500 text-white border border-red-400/40 shadow-red-950/50'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>Stopper (REC)</span>
                </>
              ) : (
                <>
                  <Circle className="w-3.5 h-3.5 fill-white" />
                  <span>Enregistrer Voix</span>
                </>
              )}
            </button>

            {/* Delete clip if exists */}
            {activeClip && (
              <button
                onClick={onDeleteClip}
                className="p-2 rounded-lg bg-zinc-850 hover:bg-red-950/50 text-zinc-400 hover:text-red-400 border border-zinc-750 transition-colors"
                title="Supprimer la prise de voix"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sync Recording Status Notice */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 px-1">
          <Headphones className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {hasInstrumentalLoaded
              ? "Enregistrement synchronisé : L'instrumental de la Piste 1 sera lu automatiquement dans vos écouteurs pendant la capture."
              : "Astuce : Générez d'abord l'instrumental sur la Piste 1 pour enregistrer les chantres en parfaite synchronisation de tempo."}
          </span>
        </div>

        {/* Waveform Visualization Canvas for Track 2 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Onde Vocale (Timeline Track 2)
              {activeClip && <span className="text-zinc-500 font-mono text-[10px]">[{activeClip.name}]</span>}
            </span>
            <span className="font-mono text-zinc-500">
              {activeClip ? `${activeClip.duration.toFixed(1)}s` : isRecording ? 'Enregistrement en cours...' : 'Aucune prise'}
            </span>
          </div>

          <WaveformCanvas
            buffer={activeClip?.buffer || null}
            currentTime={currentTime}
            duration={duration}
            color="#34d399"
            height={68}
            onSeek={onSeek}
            isRecording={isRecording}
          />
        </div>
      </div>
    </div>
  );
};
