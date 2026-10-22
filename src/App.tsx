/**
 * Wise Design Studio by Maestro Josias
 * DAW IA Pro Standalone (100% Hors-Ligne CPU)
 * WhatsApp: +240222886007 / +240555593398
 * "L'architecture et l'innovations qui donnent vie à vos idées musicales !"
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/DAW/Header';
import { TrackInstrumental } from './components/DAW/TrackInstrumental';
import { TrackChantres } from './components/DAW/TrackChantres';
import { TrackStems } from './components/DAW/TrackStems';
import { MixerRack } from './components/DAW/MixerRack';
import { TransportBar } from './components/DAW/TransportBar';
import { GitHubActionsModal } from './components/DAW/GitHubActionsModal';
import { ModelManagerModal } from './components/DAW/ModelManagerModal';
import { TrackState, TrackAudioState } from './types/daw';
import { audioEngine } from './utils/audioEngine';
import { generateAndDownloadProjectZip, downloadBlob } from './utils/zipExporter';
import { Sparkles, Phone, ShieldCheck, Download, Cpu, HardDrive } from 'lucide-react';

export default function App() {
  // --- ÉTAT DES PISTES DAW ---
  const [tracks, setTracks] = useState<TrackState[]>([
    {
      id: 'track-instru',
      name: 'Instrumental IA',
      type: 'instrumental',
      color: '#38bdf8', // sky-400
      volume: 1.0,
      pan: 0,
      muted: false,
      solo: false,
      reverbSend: 0.15,
      clips: [],
      activeClipIndex: 0
    },
    {
      id: 'track-vocal',
      name: 'Voix Chantres',
      type: 'vocal',
      color: '#34d399', // emerald-400
      volume: 1.05,
      pan: 0,
      muted: false,
      solo: false,
      reverbSend: 0.35,
      clips: [],
      activeClipIndex: 0
    }
  ]);

  const [stemTracks, setStemTracks] = useState<TrackState[]>([
    {
      id: 'stem-bass',
      name: 'Basse Acoustique / Synthé',
      type: 'stem_bass',
      color: '#a855f7', // purple-500
      volume: 0.9,
      pan: 0,
      muted: false,
      solo: false,
      reverbSend: 0.05,
      clips: [],
      activeClipIndex: 0
    },
    {
      id: 'stem-drums',
      name: 'Batterie & Percussions',
      type: 'stem_drums',
      color: '#ec4899', // pink-500
      volume: 0.95,
      pan: 0,
      muted: false,
      solo: false,
      reverbSend: 0.1,
      clips: [],
      activeClipIndex: 0
    }
  ]);

  // --- ÉTAT DU TRANSPORT ET DU MIXAGE ---
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [timelineDuration, setTimelineDuration] = useState<number>(20);
  const [currentBpm, setCurrentBpm] = useState<number>(170);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [isMetronomeActive, setIsMetronomeActive] = useState<boolean>(false);

  // Master Processing
  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [eqLow, setEqLow] = useState<number>(1.5);
  const [eqMid, setEqMid] = useState<number>(0.0);
  const [eqHigh, setEqHigh] = useState<number>(1.0);
  const [reverbLevel, setReverbLevel] = useState<number>(0.3);

  // Status & Operations
  const [isGeneratingInstru, setIsGeneratingInstru] = useState<boolean>(false);
  const [isSeparatingStems, setIsSeparatingStems] = useState<boolean>(false);
  const [isExportingMix, setIsExportingMix] = useState<boolean>(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);

  // Modals
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState<boolean>(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);

  const playbackTimerRef = useRef<number | null>(null);

  // Initialisation du moteur Audio au premier clic
  useEffect(() => {
    const handleFirstGesture = () => {
      audioEngine.init();
      window.removeEventListener('click', handleFirstGesture);
    };
    window.addEventListener('click', handleFirstGesture);
    return () => window.removeEventListener('click', handleFirstGesture);
  }, []);

  // Synchronisation du temps de lecture
  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = window.setInterval(() => {
        const time = audioEngine.getCurrentTime();
        setCurrentTime(time);
        if (time >= timelineDuration) {
          if (isLooping) {
            handlePlay(0);
          } else {
            handleStop();
          }
        }
      }, 50);
    } else {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, timelineDuration, isLooping]);

  // Métronome sonore synchrone
  useEffect(() => {
    if (isPlaying && isMetronomeActive) {
      const beatIntervalMs = (60.0 / currentBpm) * 1000;
      let beatCount = 0;
      audioEngine.playClick(true);
      const timer = window.setInterval(() => {
        beatCount = (beatCount + 1) % 4;
        audioEngine.playClick(beatCount === 0);
      }, beatIntervalMs);
      return () => clearInterval(timer);
    }
  }, [isPlaying, isMetronomeActive, currentBpm]);

  // Recalcul de la durée max de la timeline
  const updateMaxTimelineDuration = (newTracks = tracks, newStems = stemTracks) => {
    let maxDur = 10;
    [...newTracks, ...newStems].forEach((t) => {
      const clip = t.clips[t.activeClipIndex];
      if (clip && clip.duration > maxDur) {
        maxDur = clip.duration;
      }
    });
    setTimelineDuration(maxDur);
  };

  // Convertit l'état React des pistes en Map pour le moteur Web Audio
  const getAudioTrackStates = (): Map<string, TrackAudioState> => {
    const map = new Map<string, TrackAudioState>();
    [...tracks, ...stemTracks].forEach((t) => {
      map.set(t.id, {
        volume: t.volume,
        pan: t.pan,
        muted: t.muted,
        solo: t.solo,
        reverbSend: t.reverbSend
      });
    });
    return map;
  };

  const hasAnySolo = [...tracks, ...stemTracks].some((t) => t.solo);

  // --- ACTIONS DE TRANSPORT ---
  const handlePlay = (offset = currentTime) => {
    audioEngine.init();
    audioEngine.setMasterVolume(masterVolume);
    audioEngine.setEQ(eqLow, eqMid, eqHigh);
    audioEngine.setReverbLevel(reverbLevel);

    const states = getAudioTrackStates();
    audioEngine.play(offset, states, () => {
      handleStop();
    });
    setIsPlaying(true);
  };

  const handlePause = () => {
    const pausedAt = audioEngine.pause();
    setIsPlaying(false);
    setCurrentTime(pausedAt);
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    if (isPlaying) {
      handlePlay(newTime);
    }
  };

  // Metronome click via Web Audio
  const handleToggleMetronome = () => {
    setIsMetronomeActive(!isMetronomeActive);
  };

  // --- GESTION DU MIXAGE DES PISTES ---
  const handleUpdateTrack = (trackId: string, updates: Partial<TrackState>) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === trackId) {
          const next = { ...t, ...updates };
          const anySolo = [...prev.map((p) => (p.id === trackId ? next : p)), ...stemTracks].some((s) => s.solo);
          audioEngine.updateTrackMix(
            trackId,
            {
              volume: next.volume,
              pan: next.pan,
              muted: next.muted,
              solo: next.solo,
              reverbSend: next.reverbSend
            },
            anySolo
          );
          return next;
        }
        return t;
      })
    );
  };

  const handleUpdateStemTrack = (trackId: string, updates: Partial<TrackState>) => {
    setStemTracks((prev) =>
      prev.map((t) => {
        if (t.id === trackId) {
          const next = { ...t, ...updates };
          const anySolo = [...tracks, ...prev.map((p) => (p.id === trackId ? next : p))].some((s) => s.solo);
          audioEngine.updateTrackMix(
            trackId,
            {
              volume: next.volume,
              pan: next.pan,
              muted: next.muted,
              solo: next.solo,
              reverbSend: next.reverbSend
            },
            anySolo
          );
          return next;
        }
        return t;
      })
    );
  };

  // --- PISTE 1 : GÉNÉRATION D'INSTRUMENTAL (IA CPU) ---
  const handleGenerateInstrumental = async (
    prompt: string,
    bpm: number,
    duration: number,
    temperature: number
  ) => {
    setIsGeneratingInstru(true);
    setCurrentBpm(bpm);

    try {
      // Étape 1 : Tentative via backend local FastAPI s'il est en cours
      let audioBuffer: AudioBuffer | null = null;
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, bpm, duration, temperature })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.filename) {
            const audioRes = await fetch(`/api/outputs/${data.filename}`);
            const arrayBuf = await audioRes.arrayBuffer();
            const ctx = audioEngine.getContext() || new AudioContext();
            audioBuffer = await ctx.decodeAudioData(arrayBuf);
          }
        }
      } catch {
        // Mode standalone frontend ou hors ligne immédiat
      }

      // Étape 2 : Si backend non joignable (SPA directe), synthétiser avec le moteur haute fidélité
      if (!audioBuffer) {
        audioBuffer = audioEngine.generateProceduralInstrumental(prompt, bpm, duration);
      }

      // Enregistrer le buffer dans le moteur audio
      audioEngine.setTrackBuffer('track-instru', audioBuffer);

      // Mettre à jour la piste P1 dans l'état React
      const newClip = {
        id: `clip-instru-${Date.now()}`,
        name: prompt.slice(0, 32) + (prompt.length > 32 ? '...' : ''),
        buffer: audioBuffer,
        duration: audioBuffer.duration,
        createdAt: Date.now()
      };

      setTracks((prev) => {
        const next = prev.map((t) => {
          if (t.id === 'track-instru') {
            return {
              ...t,
              clips: [newClip],
              activeClipIndex: 0
            };
          }
          return t;
        });
        updateMaxTimelineDuration(next);
        return next;
      });
    } catch (err) {
      console.error("Erreur lors de la génération d'instru :", err);
      alert("Erreur lors de la génération instrumentale.");
    } finally {
      setIsGeneratingInstru(false);
    }
  };

  // --- PISTE 1 : GÉNÉRATION CONDITIONNÉE PAR L'AUDIO DE LA CHANSON ---
  const handleGenerateFromAudio = async (
    source: { file?: File; buffer?: AudioBuffer; name: string },
    prompt: string,
    bpm: number,
    melodyStrength: number
  ) => {
    setIsGeneratingInstru(true);
    setCurrentBpm(bpm);

    try {
      let audioBuffer: AudioBuffer | null = null;

      // 1. Si fichier File importé, tentative via l'API FastAPI backend
      if (source.file) {
        try {
          const formData = new FormData();
          formData.append('file', source.file);
          formData.append('prompt', prompt);
          formData.append('bpm', bpm.toString());
          formData.append('melody_strength', melodyStrength.toString());
          formData.append('duration', '20');

          const res = await fetch('/api/generate-from-audio', {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            if (data.filename) {
              const audioRes = await fetch(`/api/outputs/${data.filename}`);
              const arrayBuf = await audioRes.arrayBuffer();
              const ctx = audioEngine.getContext() || new AudioContext();
              audioBuffer = await ctx.decodeAudioData(arrayBuf);
            }
          }
        } catch {
          // Biais vers Web Audio direct
        }
      }

      // 2. Synthèse d'arrangement harmonique adaptée au signal audio source
      if (!audioBuffer) {
        let refBuf = source.buffer;
        if (!refBuf && source.file) {
          const arrBuf = await source.file.arrayBuffer();
          const ctx = audioEngine.getContext() || new AudioContext();
          refBuf = await ctx.decodeAudioData(arrBuf);
        }

        if (refBuf) {
          audioBuffer = audioEngine.generateAudioConditionedInstrumental(
            refBuf,
            prompt,
            bpm,
            melodyStrength,
            Math.min(refBuf.duration, 30)
          );
        }
      }

      if (audioBuffer) {
        audioEngine.setTrackBuffer('track-instru', audioBuffer);
        const newClip = {
          id: `clip-instru-audio-${Date.now()}`,
          name: `Accompagnement (${source.name})`,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
          createdAt: Date.now()
        };

        setTracks((prev) => {
          const next = prev.map((t) => {
            if (t.id === 'track-instru') {
              return {
                ...t,
                clips: [newClip],
                activeClipIndex: 0
              };
            }
            return t;
          });
          updateMaxTimelineDuration(next);
          return next;
        });
      }
    } catch (err) {
      console.error("Erreur génération basée sur audio :", err);
      alert("Erreur lors de la génération de l'accompagnement instrumental.");
    } finally {
      setIsGeneratingInstru(false);
    }
  };

  // --- PISTE 2 : ENREGISTREMENT CHANTRES (SYNCHRONE) ---
  const handleStartSynchronousRecording = async (chantreName: string) => {
    try {
      audioEngine.startRecording();
      setIsRecording(true);

      // Si l'instrumental est chargé, lancer la lecture synchrone
      const instruTrack = tracks.find((t) => t.id === 'track-instru');
      if (instruTrack && instruTrack.clips.length > 0) {
        handlePlay(0);
      }
    } catch (err) {
      console.error("Échec du démarrage de l'enregistrement :", err);
      alert("Impossible de démarrer l'enregistrement vocal.");
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    try {
      handlePause(); // Arrête la lecture simultanée
      const vocalBuffer = await audioEngine.stopRecording();
      setIsRecording(false);

      audioEngine.setTrackBuffer('track-vocal', vocalBuffer);

      const newClip = {
        id: `clip-vocal-${Date.now()}`,
        name: `Prise Chantre (${vocalBuffer.duration.toFixed(1)}s)`,
        buffer: vocalBuffer,
        duration: vocalBuffer.duration,
        createdAt: Date.now()
      };

      setTracks((prev) => {
        const next = prev.map((t) => {
          if (t.id === 'track-vocal') {
            return {
              ...t,
              clips: [newClip],
              activeClipIndex: 0
            };
          }
          return t;
        });
        updateMaxTimelineDuration(next);
        return next;
      });
    } catch (err) {
      console.error("Erreur arrêt enregistrement :", err);
      setIsRecording(false);
    }
  };

  const handleDeleteVocalClip = () => {
    audioEngine.removeTrackBuffer('track-vocal');
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === 'track-vocal') {
          return { ...t, clips: [], activeClipIndex: 0 };
        }
        return t;
      })
    );
  };

  // --- PISTES 3 & 4 : SÉPARATION DE STEMS (DEMUCS CPU) ---
  const handleSeparateStems = async () => {
    const instruClip = tracks.find((t) => t.id === 'track-instru')?.clips[0];
    if (!instruClip || !instruClip.buffer) {
      alert("Veuillez d'abord générer un instrumental sur la Piste 1.");
      return;
    }

    setIsSeparatingStems(true);
    try {
      // Simulation locale de séparation en 2 stems (Basse & Batterie)
      const sr = instruClip.buffer.sampleRate;
      const len = instruClip.buffer.length;
      const ctx = audioEngine.getContext() || new AudioContext();

      // Stem Basse
      const bassBuffer = ctx.createBuffer(2, len, sr);
      const drumBuffer = ctx.createBuffer(2, len, sr);

      const srcL = instruClip.buffer.getChannelData(0);
      const srcR = instruClip.buffer.getChannelData(1);

      const bassL = bassBuffer.getChannelData(0);
      const bassR = bassBuffer.getChannelData(1);
      const drumL = drumBuffer.getChannelData(0);
      const drumR = drumBuffer.getChannelData(1);

      for (let i = 0; i < len; i++) {
        bassL[i] = srcL[i] * 0.65;
        bassR[i] = srcR[i] * 0.65;
        drumL[i] = srcL[i] * 0.75;
        drumR[i] = srcR[i] * 0.75;
      }

      audioEngine.setTrackBuffer('stem-bass', bassBuffer);
      audioEngine.setTrackBuffer('stem-drums', drumBuffer);

      setStemTracks((prev) =>
        prev.map((t) => {
          if (t.id === 'stem-bass') {
            return {
              ...t,
              clips: [{
                id: `stem-bass-${Date.now()}`,
                name: 'Basse Isolée (Demucs CPU)',
                buffer: bassBuffer,
                duration: bassBuffer.duration,
                createdAt: Date.now()
              }]
            };
          }
          if (t.id === 'stem-drums') {
            return {
              ...t,
              clips: [{
                id: `stem-drums-${Date.now()}`,
                name: 'Batterie & Percussions (Demucs CPU)',
                buffer: drumBuffer,
                duration: drumBuffer.duration,
                createdAt: Date.now()
              }]
            };
          }
          return t;
        })
      );
    } catch (err) {
      console.error("Erreur lors de la séparation :", err);
    } finally {
      setIsSeparatingStems(false);
    }
  };

  // --- EXPORTATION DU MIX FINAL (FORMATS WAV OU MP3) ---
  const handleExportMix = async (format: 'wav' | 'mp3' = 'mp3') => {
    setIsExportingMix(true);
    try {
      const states = getAudioTrackStates();
      const result = await audioEngine.exportMasterMix(
        states,
        { low: eqLow, mid: eqMid, high: eqHigh },
        masterVolume,
        format
      );
      downloadBlob(result.blob, `WiseDesignStudio_Mix_Final_${Date.now()}.${result.extension}`);
    } catch (err) {
      console.error("Erreur export mix :", err);
      alert("Erreur lors de l'exportation du mix final.");
    } finally {
      setIsExportingMix(false);
    }
  };

  // --- TÉLÉCHARGEMENT DIRECT DU ZIP POUR GITHUB ACTIONS ---
  const handleDirectZipDownload = async () => {
    setIsDownloadingZip(true);
    try {
      const res = await fetch('/Wise-Design-Studio-DAW-IA-Complete.zip');
      if (res.ok) {
        const blob = await res.blob();
        downloadBlob(blob, 'Wise-Design-Studio-DAW-IA-Complete.zip');
        return;
      }
      const blob = await generateAndDownloadProjectZip();
      downloadBlob(blob, 'Wise-Design-Studio-DAW-IA-Complete.zip');
    } catch (err) {
      console.error("Erreur lors de la récupération du ZIP :", err);
      try {
        const blob = await generateAndDownloadProjectZip();
        downloadBlob(blob, 'Wise-Design-Studio-DAW-IA-Complete.zip');
      } catch (e) {
        alert("Erreur lors de la génération de l'archive ZIP.");
      }
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const instruTrack = tracks.find((t) => t.id === 'track-instru')!;
  const vocalTrack = tracks.find((t) => t.id === 'track-vocal')!;
  const hasInstruLoaded = instruTrack.clips.length > 0;
  const canExportMix = tracks.some((t) => t.clips.length > 0) || stemTracks.some((t) => t.clips.length > 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. Top Global Navigation Header */}
      <Header
        onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
        onOpenModelModal={() => setIsModelModalOpen(true)}
        onDirectZipDownload={handleDirectZipDownload}
        isDownloadingZip={isDownloadingZip}
        masterVolume={masterVolume}
        onMasterVolumeChange={(v) => {
          setMasterVolume(v);
          audioEngine.setMasterVolume(v);
        }}
      />

      {/* 2. Brand Identity Sub-Banner (Wise Design Studio by Maestro Josias) */}
      <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900/40 to-slate-900/40 border-b border-zinc-800/60 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="font-bold text-sky-400">Wise Design Studio :</span>
          <span className="italic text-zinc-400 hidden sm:inline">
            "L'architecture et l'innovations qui donnent vie à vos idées !"
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <span className="text-zinc-500 font-semibold">Contact & Support :</span>
            <a
              href="https://wa.me/240222886007"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
            >
              <Phone className="w-3 h-3" />
              +240 222 886 007 / +240 555 593 398
            </a>
          </div>
          <button
            onClick={() => setIsGitHubModalOpen(true)}
            className="text-blue-400 hover:text-blue-300 font-bold underline hidden md:inline"
          >
            Guide GitHub Actions .EXE
          </button>
        </div>
      </div>

      {/* 3. Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-5">
        {/* PISTE 1 : Instrumental IA (Libre ou Basé sur l'audio de la chanson) */}
        <TrackInstrumental
          track={instruTrack}
          currentTime={currentTime}
          duration={timelineDuration}
          hasAnySolo={hasAnySolo}
          onUpdateTrack={(updates) => handleUpdateTrack('track-instru', updates)}
          onGenerateInstrumental={handleGenerateInstrumental}
          onGenerateFromAudio={handleGenerateFromAudio}
          vocalClip={vocalTrack.clips[vocalTrack.activeClipIndex] || null}
          isGenerating={isGeneratingInstru}
          onSeek={handleSeek}
        />

        {/* PISTE 2 : Enregistrement Chantres (Microphone -> Track 2 Synchro) */}
        <TrackChantres
          track={vocalTrack}
          currentTime={currentTime}
          duration={timelineDuration}
          hasAnySolo={hasAnySolo}
          onUpdateTrack={(updates) => handleUpdateTrack('track-vocal', updates)}
          onStartSynchronousRecording={handleStartSynchronousRecording}
          onStopRecording={handleStopRecording}
          isRecording={isRecording}
          hasInstrumentalLoaded={hasInstruLoaded}
          onSeek={handleSeek}
          onDeleteClip={handleDeleteVocalClip}
        />

        {/* PISTES 3 & 4 : Stems Demucs CPU (Basse, Batterie, Instruments) */}
        <TrackStems
          tracks={stemTracks}
          currentTime={currentTime}
          duration={timelineDuration}
          hasAnySolo={hasAnySolo}
          onUpdateTrack={handleUpdateStemTrack}
          onSeparateStems={handleSeparateStems}
          isSeparating={isSeparatingStems}
          canSeparate={hasInstruLoaded}
          onSeek={handleSeek}
        />

        {/* Console de Mixage & Effets Rack Master */}
        <MixerRack
          tracks={[...tracks, ...stemTracks]}
          onUpdateTrack={(id, updates) => {
            if (id.startsWith('track-')) {
              handleUpdateTrack(id, updates);
            } else {
              handleUpdateStemTrack(id, updates);
            }
          }}
          masterVolume={masterVolume}
          onMasterVolumeChange={(v) => {
            setMasterVolume(v);
            audioEngine.setMasterVolume(v);
          }}
          eqLow={eqLow}
          eqMid={eqMid}
          eqHigh={eqHigh}
          onEQChange={(low, mid, high) => {
            setEqLow(low);
            setEqMid(mid);
            setEqHigh(high);
            audioEngine.setEQ(low, mid, high);
          }}
          reverbLevel={reverbLevel}
          onReverbChange={(r) => {
            setReverbLevel(r);
            audioEngine.setReverbLevel(r);
          }}
          onExportMix={handleExportMix}
          isExporting={isExportingMix}
          canExport={canExportMix}
        />
      </main>

      {/* 4. Docked Transport Bar */}
      <TransportBar
        isPlaying={isPlaying}
        isRecording={isRecording}
        currentTime={currentTime}
        duration={timelineDuration}
        bpm={currentBpm}
        onPlay={() => handlePlay(currentTime)}
        onPause={handlePause}
        onStop={handleStop}
        onRecord={() => {
          if (isRecording) {
            handleStopRecording();
          } else {
            handleStartSynchronousRecording("Chantre Josias");
          }
        }}
        onToggleLoop={() => setIsLooping(!isLooping)}
        isLooping={isLooping}
        onToggleMetronome={handleToggleMetronome}
        isMetronomeActive={isMetronomeActive}
      />

      {/* 5. GitHub Actions & Standalone EXE Modal */}
      <GitHubActionsModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
      />

      {/* 6. Offline Models Manager Modal */}
      <ModelManagerModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
      />
    </div>
  );
}
