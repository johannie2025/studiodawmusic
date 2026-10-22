import React, { useState, useRef } from 'react';
import {
  Sparkles, Music2, Sliders, Volume2, Wand2, RefreshCw, Upload,
  FileAudio, Mic, Radio, Check, Layers, Disc3, ArrowRight
} from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { TrackState, AudioClip, GenerationMode } from '../../types/daw';
import { audioEngine } from '../../utils/audioEngine';

interface TrackInstrumentalProps {
  track: TrackState;
  currentTime: number;
  duration: number;
  hasAnySolo: boolean;
  onUpdateTrack: (updates: Partial<TrackState>) => void;
  onGenerateInstrumental: (prompt: string, bpm: number, duration: number, temp: number) => Promise<void>;
  onGenerateFromAudio: (source: { file?: File; buffer?: AudioBuffer; name: string }, prompt: string, bpm: number, melodyStrength: number) => Promise<void>;
  vocalClip?: AudioClip | null;
  isGenerating: boolean;
  onSeek: (time: number) => void;
}

const PRESET_PROMPTS = [
  {
    name: "Gospel Bikutsi 170 BPM",
    bpm: 170,
    prompt: "Gospel traditionnel bikutsi 170 BPM, piano, basse rapide, percussions africaines, cloche woodblock",
    tag: "Bikutsi Cameroun"
  },
  {
    name: "Makossa Praise 125 BPM",
    bpm: 125,
    prompt: "Makossa & Highlife praise, basse bondissante, guitare rythmique afro, cuivres vibrants, batterie gospel",
    tag: "Makossa / Highlife"
  },
  {
    name: "Adoration Douce 70 BPM",
    bpm: 70,
    prompt: "Gospel adoration douce piano acoustique, nappe de cordes céleste, basse chaleureuse, ambiance prière",
    tag: "Adoration & Worship"
  },
  {
    name: "Afrobeat Praise 115 BPM",
    bpm: 115,
    prompt: "Afrobeat gospel moderne 115 BPM, synthés cuivrés, basse percutante, congas, groove dynamique",
    tag: "Afro-Gospel"
  },
  {
    name: "Rumba Congolaise 100 BPM",
    bpm: 100,
    prompt: "Rumba congolaise chrétienne, guitare solo soukous lumineuse, guitare mi-solo, basse mélodieuse",
    tag: "Rumba Praise"
  }
];

export const TrackInstrumental: React.FC<TrackInstrumentalProps> = ({
  track,
  currentTime,
  duration,
  hasAnySolo,
  onUpdateTrack,
  onGenerateInstrumental,
  onGenerateFromAudio,
  vocalClip,
  isGenerating,
  onSeek
}) => {
  // Mode de génération : 'free' (texte libre) ou 'audio_reference' (basé sur audio chanson)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('free');

  // Champs Mode Libre
  const [prompt, setPrompt] = useState<string>("Gospel traditionnel bikutsi 170 BPM, piano, basse");
  const [bpm, setBpm] = useState<number>(170);
  const [instruDuration, setInstruDuration] = useState<number>(20);
  const [temperature, setTemperature] = useState<number>(1.0);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Champs Mode Audio Chanson
  const [audioPrompt, setAudioPrompt] = useState<string>("Accompagnement gospel traditionnel, piano, basse groove et batterie");
  const [melodyStrength, setMelodyStrength] = useState<number>(0.75);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [referenceBuffer, setReferenceBuffer] = useState<AudioBuffer | null>(null);
  const [referenceSourceLabel, setReferenceSourceLabel] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeClip = track.clips[track.activeClipIndex] || null;

  // Lancement Génération Libre
  const handleGenerateFree = async () => {
    if (!prompt.trim() || isGenerating) return;
    await onGenerateInstrumental(prompt, bpm, instruDuration, temperature);
  };

  // Traitement d'un fichier audio importé
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setReferenceSourceLabel(`Fichier : ${file.name}`);

    // Décodage pour prévisualisation d'onde
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = audioEngine.getContext() || new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setReferenceBuffer(decoded);
    } catch (err) {
      console.error("Erreur de décodage du fichier audio :", err);
    }
  };

  // Utiliser la prise vocale enregistrée sur la Piste 2
  const handleUseVocalTrack = () => {
    if (!vocalClip || !vocalClip.buffer) return;
    setReferenceBuffer(vocalClip.buffer);
    setUploadedFile(null);
    setReferenceSourceLabel(`Voix Chantre Piste 2 (${vocalClip.name})`);
  };

  // Lancement Génération Basée sur l'Audio
  const handleGenerateFromAudio = async () => {
    if ((!uploadedFile && !referenceBuffer) || isGenerating) return;

    await onGenerateFromAudio(
      {
        file: uploadedFile || undefined,
        buffer: referenceBuffer || undefined,
        name: referenceSourceLabel || "Chanson Source"
      },
      audioPrompt,
      bpm,
      melodyStrength
    );
  };

  const handleSelectPreset = (p: typeof PRESET_PROMPTS[0]) => {
    setPrompt(p.prompt);
    setAudioPrompt(`Accompagnement dans le style : ${p.name}, piano, basse et batterie`);
    setBpm(p.bpm);
  };

  const isAudible = hasAnySolo ? track.solo : !track.muted;

  return (
    <div className={`rounded-xl border transition-all ${
      isAudible ? 'bg-zinc-900/90 border-blue-500/40 shadow-md shadow-blue-950/20' : 'bg-zinc-950/80 border-zinc-800/80 opacity-70'
    } overflow-hidden`}>
      {/* Track Header / Identity */}
      <div className="bg-zinc-950/80 px-4 py-2.5 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 font-bold text-xs">
            P1
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">PISTE 1 : Instrumental IA</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Libre & Audio-to-Music (CPU)
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Génération textuelle libre ou composition d'accompagnement à partir de l'audio de la chanson
            </p>
          </div>
        </div>

        {/* Quick Track Mixer Controls (Mute, Solo, Volume, Pan, Reverb) */}
        <div className="flex items-center gap-2 sm:gap-3 bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800">
          {/* Mute */}
          <button
            onClick={() => onUpdateTrack({ muted: !track.muted })}
            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${
              track.muted ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Mute Track"
          >
            M
          </button>

          {/* Solo */}
          <button
            onClick={() => onUpdateTrack({ solo: !track.solo })}
            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${
              track.solo ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Solo Track"
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
              className="w-16 h-1.5 accent-blue-500 bg-zinc-700 rounded-lg cursor-pointer"
              title={`Volume Piste 1: ${Math.round(track.volume * 100)}%`}
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
              className="w-12 h-1.5 accent-blue-500 bg-zinc-700 rounded-lg cursor-pointer"
              title={`Pan: ${track.pan < 0 ? 'G' : track.pan > 0 ? 'D' : 'C'}`}
            />
          </div>

          {/* Reverb Send */}
          <div className="hidden md:flex items-center gap-1 text-[11px] text-zinc-400">
            <span className="text-[10px] font-semibold text-sky-400">REV</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={track.reverbSend}
              onChange={(e) => onUpdateTrack({ reverbSend: parseFloat(e.target.value) })}
              className="w-12 h-1.5 accent-sky-400 bg-zinc-700 rounded-lg cursor-pointer"
              title={`Réverb: ${Math.round(track.reverbSend * 100)}%`}
            />
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs (Mode Libre vs Mode Basé sur Audio Chanson) */}
      <div className="bg-zinc-950/90 px-4 pt-2.5 border-b border-zinc-800/80 flex items-center gap-2">
        <button
          onClick={() => setGenerationMode('free')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-bold transition-all border-t border-x ${
            generationMode === 'free'
              ? 'bg-zinc-900 border-zinc-700 text-sky-300'
              : 'bg-zinc-950 border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Disc3 className="w-3.5 h-3.5 text-blue-400" />
          <span>Mode 1 : Génération Libre (Prompt Texte)</span>
        </button>

        <button
          onClick={() => setGenerationMode('audio_reference')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-bold transition-all border-t border-x relative ${
            generationMode === 'audio_reference'
              ? 'bg-zinc-900 border-zinc-700 text-emerald-300'
              : 'bg-zinc-950 border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileAudio className="w-3.5 h-3.5 text-emerald-400" />
          <span>Mode 2 : Basé sur l'Audio de la Chanson</span>
          <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[9px] rounded-full font-bold ml-1">
            Nouveau
          </span>
        </button>
      </div>

      {/* Main Panel Body */}
      <div className="p-4 space-y-3.5">
        {/* ========================================================= */}
        {/* CAS 1 : MODE LIBRE (Prompt Texte) */}
        {/* ========================================================= */}
        {generationMode === 'free' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: Gospel traditionnel bikutsi 170 BPM, piano, basse..."
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg pl-3.5 pr-20 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="absolute right-2 top-2 px-2 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 rounded border border-zinc-700 flex items-center gap-1"
                  title="Ajuster BPM, durée et température"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{bpm} BPM</span>
                </button>
              </div>

              {/* Bouton Générer l'instrumental libre */}
              <button
                onClick={handleGenerateFree}
                disabled={isGenerating || !prompt.trim()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md shadow-blue-600/30 disabled:opacity-50 shrink-0 border border-sky-400/30"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-200" />
                    <span>Inférence CPU...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 text-sky-200" />
                    <span>Générer l'instrumental libre</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-zinc-500 text-[11px] font-semibold mr-1">Styles Prédéfinis :</span>
              {PRESET_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPreset(p)}
                  className="px-2.5 py-1 rounded-md bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-750 hover:border-blue-500/50 transition-all text-[11px] flex items-center gap-1"
                >
                  <Music2 className="w-2.5 h-2.5 text-blue-400" />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>

            {/* Config collapsable */}
            {showConfig && (
              <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800 flex flex-wrap items-center gap-6 text-xs text-zinc-300 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-400">Tempo :</span>
                  <input
                    type="range"
                    min="60"
                    max="200"
                    value={bpm}
                    onChange={(e) => setBpm(parseInt(e.target.value))}
                    className="w-24 h-1.5 accent-blue-500 bg-zinc-800 rounded cursor-pointer"
                  />
                  <span className="font-mono text-blue-400 font-bold w-12">{bpm} BPM</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-400">Durée :</span>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={instruDuration}
                    onChange={(e) => setInstruDuration(parseInt(e.target.value))}
                    className="w-24 h-1.5 accent-blue-500 bg-zinc-800 rounded cursor-pointer"
                  />
                  <span className="font-mono text-zinc-200 font-bold w-10">{instruDuration}s</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-400">Température :</span>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-20 h-1.5 accent-blue-500 bg-zinc-800 rounded cursor-pointer"
                  />
                  <span className="font-mono text-zinc-200">{temperature}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* CAS 2 : MODE BASÉ SUR L'AUDIO DE LA CHANSON */}
        {/* ========================================================= */}
        {generationMode === 'audio_reference' && (
          <div className="bg-zinc-950/90 p-3.5 rounded-xl border border-emerald-500/30 space-y-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <FileAudio className="w-4 h-4 text-emerald-400" />
                Sélection de la Chanson Source (Mélodie & Harmonie de Référence)
              </span>
              <span className="text-[11px] text-zinc-400">
                L'IA compose un accompagnement instrumental adapté à cette chanson
              </span>
            </div>

            {/* Source Selection Buttons : Fichier Externe OU Voix Piste 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Importer fichier audio (MP3 / WAV) */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500 bg-zinc-900/60 p-3 rounded-lg flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-zinc-200">
                    {uploadedFile ? uploadedFile.name : "Importer un MP3 / WAV..."}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Glisser ou cliquer pour importer la chanson
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Option 2: Utiliser la voix de la Piste 2 chantre */}
              <button
                type="button"
                onClick={handleUseVocalTrack}
                disabled={!vocalClip || !vocalClip.buffer}
                className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${
                  vocalClip?.buffer
                    ? 'bg-zinc-900/60 border-zinc-700 hover:border-emerald-500 cursor-pointer'
                    : 'bg-zinc-950 border-zinc-850 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-zinc-200">
                    Utiliser la Voix Piste 2
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    {vocalClip?.buffer ? `Prise active (${vocalClip.duration.toFixed(1)}s)` : "Enregistrez d'abord une voix sur P2"}
                  </div>
                </div>
              </button>
            </div>

            {/* Reference Audio Preview */}
            {referenceBuffer && (
              <div className="bg-zinc-900/70 p-2.5 rounded-lg border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-300">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Chanson source chargée : {referenceSourceLabel}
                  </span>
                  <span className="font-mono text-zinc-400">{referenceBuffer.duration.toFixed(1)}s</span>
                </div>
                <WaveformCanvas
                  buffer={referenceBuffer}
                  currentTime={0}
                  duration={referenceBuffer.duration}
                  color="#10b981"
                  height={40}
                />
              </div>
            )}

            {/* Prompt pour le style d'accompagnement de la chanson */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                Style d'orchestration pour accompagner cette chanson :
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  type="text"
                  value={audioPrompt}
                  onChange={(e) => setAudioPrompt(e.target.value)}
                  placeholder="Ex: Accompagnement bikutsi 170 BPM piano basse, ou orchestration gospel douce..."
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />

                <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-zinc-400">Tempo :</span>
                  <input
                    type="range"
                    min="60"
                    max="200"
                    value={bpm}
                    onChange={(e) => setBpm(parseInt(e.target.value))}
                    className="w-16 h-1.5 accent-emerald-500 bg-zinc-800 rounded cursor-pointer"
                  />
                  <span className="font-mono text-emerald-400 font-bold">{bpm}</span>
                </div>

                {/* Bouton Générer Arrangement */}
                <button
                  onClick={handleGenerateFromAudio}
                  disabled={isGenerating || (!uploadedFile && !referenceBuffer)}
                  className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs transition-all shadow-md shadow-emerald-700/30 disabled:opacity-40 shrink-0 border border-emerald-400/40"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Arrangement CPU...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Générer l'Instrumental pour cette Chanson</span>
                    </>
                  )}
                </button>
              </div>

              {/* Slider Fidélité Mélodique */}
              <div className="flex items-center gap-3 pt-1 text-xs text-zinc-400">
                <span>Fidélité mélodique à la chanson :</span>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={melodyStrength}
                  onChange={(e) => setMelodyStrength(parseFloat(e.target.value))}
                  className="w-28 h-1.5 accent-emerald-500 bg-zinc-800 rounded cursor-pointer"
                />
                <span className="font-mono text-emerald-400 font-bold">
                  {Math.round(melodyStrength * 100)}%
                </span>
                <span className="text-[10px] text-zinc-500">
                  (Plus élevé = respecte fidèlement les notes de la chanson)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Waveform Visualization Canvas for Track 1 Output */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              Résultat PISTE 1 (Timeline Instrumentale Active)
              {activeClip && <span className="text-zinc-500 font-mono text-[10px]">[{activeClip.name}]</span>}
            </span>
            <span className="font-mono text-zinc-500">
              {activeClip ? `${activeClip.duration.toFixed(1)}s` : 'Aucun instrumental généré'}
            </span>
          </div>

          <WaveformCanvas
            buffer={activeClip?.buffer || null}
            currentTime={currentTime}
            duration={duration}
            color="#38bdf8"
            height={68}
            onSeek={onSeek}
          />
        </div>
      </div>
    </div>
  );
};
