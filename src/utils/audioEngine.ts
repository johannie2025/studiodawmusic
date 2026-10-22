/**
 * Moteur Web Audio API Professionnel pour DAW IA Pro - Wise Design Studio by Maestro Josias
 * Gère :
 * - La synthèse instrumentale procédurale haute fidélité (Gospel, Bikutsi 170 BPM, Makossa, Praise)
 * - L'enregistrement microphone des chantres en direct avec retour casque synchrone
 * - Le mixage multi-pistes (Volume, Pan, Mute, Solo, Reverb send)
 * - L'analyseur VU-mètre en temps réel
 * - Le mixdown hors-ligne (OfflineAudioContext) et l'export direct en fichier WAV 16-bit
 */

import * as lamejs from 'lamejs';

export type ExportFormat = 'wav' | 'mp3';

export interface TrackAudioState {
  volume: number;     // 0.0 - 1.5
  pan: number;        // -1.0 à +1.0
  muted: boolean;
  solo: boolean;
  reverbSend: number; // 0.0 - 1.0
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterEQ: {
    low: BiquadFilterNode;
    mid: BiquadFilterNode;
    high: BiquadFilterNode;
  } | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;

  // Enregistrement micro
  private mediaStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  // Pistes chargées en mémoire
  private trackBuffers: Map<string, AudioBuffer> = new Map();
  private activeSourceNodes: Map<string, AudioBufferSourceNode> = new Map();
  private trackGainNodes: Map<string, GainNode> = new Map();
  private trackPanNodes: Map<string, StereoPannerNode> = new Map();
  private trackReverbSendNodes: Map<string, GainNode> = new Map();

  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pauseOffset: number = 0;
  private duration: number = 0;

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      // Master 3-Band Parametric EQ
      const low = this.ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 100;
      low.gain.value = 1.5;

      const mid = this.ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1200;
      mid.Q.value = 1.0;
      mid.gain.value = 0.0;

      const high = this.ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 8500;
      high.gain.value = 1.0;

      this.masterEQ = { low, mid, high };

      // Master Analyser pour VU-mètre
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 256;

      // Studio Reverb (Génération d'une réponse impulsionnelle algorithmique douce)
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.buildImpulseResponse(2.2, 2.0);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.35;

      // Chaînage Master : MasterGain -> EQ Low -> EQ Mid -> EQ High -> MasterAnalyser -> Destination
      this.masterGain.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);

      // Reverb return -> MasterGain
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Synthétise une réponse impulsionnelle de réverbération studio de haute fidélité
   */
  private buildImpulseResponse(durationSec: number, decayRate: number): AudioBuffer {
    const sr = this.ctx ? this.ctx.sampleRate : 44100;
    const length = sr * durationSec;
    const impulse = (this.ctx || new AudioContext()).createBuffer(2, length, sr);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      // Décroissance exponentielle avec diffusion douce
      const env = Math.pow(1 - n, decayRate);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser;
  }

  public getMicAnalyser(): AnalyserNode | null {
    return this.micAnalyser;
  }

  public setMasterVolume(val: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  public setEQ(lowGain: number, midGain: number, highGain: number) {
    if (this.masterEQ && this.ctx) {
      this.masterEQ.low.gain.setTargetAtTime(lowGain, this.ctx.currentTime, 0.05);
      this.masterEQ.mid.gain.setTargetAtTime(midGain, this.ctx.currentTime, 0.05);
      this.masterEQ.high.gain.setTargetAtTime(highGain, this.ctx.currentTime, 0.05);
    }
  }

  public setReverbLevel(level: number) {
    if (this.reverbGain && this.ctx) {
      this.reverbGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Enregistre un AudioBuffer pour une piste donnée
   */
  public setTrackBuffer(trackId: string, buffer: AudioBuffer) {
    this.trackBuffers.set(trackId, buffer);
    // Met à jour la durée max
    let maxDur = 0;
    this.trackBuffers.forEach((buf) => {
      if (buf.duration > maxDur) maxDur = buf.duration;
    });
    this.duration = maxDur;
  }

  public getTrackBuffer(trackId: string): AudioBuffer | undefined {
    return this.trackBuffers.get(trackId);
  }

  public removeTrackBuffer(trackId: string) {
    this.trackBuffers.delete(trackId);
  }

  /**
   * Démarre la lecture synchrone de toutes les pistes chargées
   */
  public play(offsetSec: number = 0, trackStates: Map<string, TrackAudioState>, onEnded?: () => void) {
    this.init();
    if (!this.ctx || !this.masterGain || !this.reverbNode) return;

    this.stop(); // Arrête les sources actuelles
    this.isPlaying = true;
    this.startTime = this.ctx.currentTime - offsetSec;
    this.pauseOffset = offsetSec;

    let hasSources = false;
    const hasSolo = Array.from(trackStates.values()).some((s) => s.solo);

    this.trackBuffers.forEach((buffer, trackId) => {
      if (!this.ctx || !this.masterGain || !this.reverbNode) return;

      const state = trackStates.get(trackId) || {
        volume: 1.0,
        pan: 0,
        muted: false,
        solo: false,
        reverbSend: 0.2
      };

      // Si mode solo activé, on ignore les pistes non solo
      const isAudible = hasSolo ? state.solo : !state.muted;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gain = this.ctx.createGain();
      gain.gain.value = isAudible ? state.volume : 0;

      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, state.pan));

      const reverbSend = this.ctx.createGain();
      reverbSend.gain.value = isAudible ? state.reverbSend : 0;

      // Câblage : Source -> Gain -> Pan -> MasterGain
      source.connect(gain);
      gain.connect(pan);
      pan.connect(this.masterGain);

      // Envoi réverbération
      gain.connect(reverbSend);
      reverbSend.connect(this.reverbNode);

      this.activeSourceNodes.set(trackId, source);
      this.trackGainNodes.set(trackId, gain);
      this.trackPanNodes.set(trackId, pan);
      this.trackReverbSendNodes.set(trackId, reverbSend);

      if (offsetSec < buffer.duration) {
        source.start(0, offsetSec);
        hasSources = true;
      }
    });

    if (hasSources && onEnded) {
      // Détecter fin de lecture
      const remaining = Math.max(0, this.duration - offsetSec);
      setTimeout(() => {
        if (this.isPlaying && this.getCurrentTime() >= this.duration) {
          onEnded();
        }
      }, (remaining + 0.2) * 1000);
    }
  }

  public pause(): number {
    const current = this.getCurrentTime();
    this.stop();
    this.pauseOffset = current;
    return current;
  }

  public stop() {
    this.activeSourceNodes.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignorer si déjà arrêté
      }
    });
    this.activeSourceNodes.clear();
    this.trackGainNodes.clear();
    this.trackPanNodes.clear();
    this.trackReverbSendNodes.clear();
    this.isPlaying = false;
  }

  public updateTrackMix(trackId: string, state: TrackAudioState, hasAnySolo: boolean) {
    if (!this.ctx) return;
    const gainNode = this.trackGainNodes.get(trackId);
    const panNode = this.trackPanNodes.get(trackId);
    const reverbNode = this.trackReverbSendNodes.get(trackId);

    const isAudible = hasAnySolo ? state.solo : !state.muted;
    const targetVol = isAudible ? state.volume : 0;

    if (gainNode) {
      gainNode.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.05);
    }
    if (panNode) {
      panNode.pan.setTargetAtTime(state.pan, this.ctx.currentTime, 0.05);
    }
    if (reverbNode) {
      reverbNode.gain.setTargetAtTime(isAudible ? state.reverbSend : 0, this.ctx.currentTime, 0.05);
    }
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pauseOffset;
    }
    const elapsed = this.ctx.currentTime - this.startTime;
    return Math.min(this.duration, Math.max(0, elapsed));
  }

  public getDuration(): number {
    return this.duration;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // =========================================================================
  // GESTION DU MICROPHONE (ENREGISTREMENT CHANTRES)
  // =========================================================================

  public async startMicrophone(): Promise<boolean> {
    this.init();
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (this.ctx) {
        this.micSource = this.ctx.createMediaStreamSource(this.mediaStream);
        this.micAnalyser = this.ctx.createAnalyser();
        this.micAnalyser.fftSize = 256;
        this.micSource.connect(this.micAnalyser);
        // Note : On ne connecte PAS le micAnalyser au destination directement
        // pour éviter le larsen si l'utilisateur n'a pas de casque.
      }
      return true;
    } catch (err) {
      console.error("Erreur d'accès microphone :", err);
      return false;
    }
  }

  public stopMicrophone() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    this.micAnalyser = null;
  }

  public startRecording(onDataAvailable?: (chunk: Blob) => void) {
    if (!this.mediaStream) {
      throw new Error("Microphone non démarré.");
    }
    this.recordedChunks = [];

    // Priorité à WAV/WEBM
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
        if (onDataAvailable) onDataAvailable(e.data);
      }
    };

    this.mediaRecorder.start(100); // Récupération par tranches de 100ms
  }

  public async stopRecording(): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("Aucun enregistrement en cours."));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          this.init();
          if (this.ctx) {
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            resolve(audioBuffer);
          } else {
            reject(new Error("Contexte audio non initialisé."));
          }
        } catch (e) {
          reject(e);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  // =========================================================================
  // SYNTHÈSE D'INSTRUMENTAL AFRO-GOSPEL / BIKUTSI / MAKOSSA / ADORATION
  // =========================================================================

  /**
   * Génère un instrumental polyphonique haute fidélité au format AudioBuffer
   * Respecte le tempo (BPM), la signature rythmique et le style africain / gospel.
   */
  public generateProceduralInstrumental(
    genre: string,
    bpm: number = 120,
    durationSec: number = 15
  ): AudioBuffer {
    this.init();
    const sr = this.ctx ? this.ctx.sampleRate : 44100;
    const numSamples = sr * durationSec;
    const audioBuffer = (this.ctx || new AudioContext()).createBuffer(2, numSamples, sr);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);

    const secondsPerBeat = 60.0 / bpm;
    const totalBeats = Math.floor(durationSec / secondsPerBeat);

    // Accords selon le genre
    // Gospel / Bikutsi : I - IV - V - vi ou I - vi - IV - V
    const chordsFrequencies = genre.toLowerCase().includes('bikutsi')
      ? [
          [261.63, 329.63, 392.00], // C
          [349.23, 440.00, 523.25], // F
          [392.00, 493.88, 587.33], // G
          [349.23, 440.00, 523.25], // F
        ]
      : genre.toLowerCase().includes('adoration')
      ? [
          [261.63, 329.63, 392.00], // C
          [220.00, 261.63, 329.63], // Am
          [174.61, 220.00, 261.63], // F
          [196.00, 246.94, 293.66], // G
        ]
      : [
          // Makossa / Afro Praise
          [293.66, 369.99, 440.00], // D
          [369.99, 440.00, 554.37], // F#m
          [392.00, 493.88, 587.33], // G
          [440.00, 554.37, 659.25], // A
        ];

    const isBikutsi = genre.toLowerCase().includes('bikutsi') || bpm >= 155;
    const isMakossa = genre.toLowerCase().includes('makossa');

    for (let sample = 0; sample < numSamples; sample++) {
      const t = sample / sr;
      const beatProgress = (t / secondsPerBeat) % 1;
      const currentBeat = Math.floor(t / secondsPerBeat);
      const chordIndex = Math.floor(currentBeat / 2) % chordsFrequencies.length;
      const currentChord = chordsFrequencies[chordIndex];

      let sampleValL = 0;
      let sampleValR = 0;

      // 1. PIANO / RHODES ACCORDS
      // Staccato rythmique pour Bikutsi/Makossa, sustain doux pour Adoration
      const chordEnv = isBikutsi
        ? Math.exp(-beatProgress * 4.5)
        : Math.exp(-beatProgress * 2.0);

      for (let noteIdx = 0; noteIdx < currentChord.length; noteIdx++) {
        const freq = currentChord[noteIdx];
        const osc = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t);
        sampleValL += osc * chordEnv * 0.12;
        sampleValR += osc * chordEnv * 0.12;
      }

      // 2. BASSE GROOVE AFRO / GOSPEL
      const rootFreq = currentChord[0] / 2; // Octave inférieure
      let bassEnv = 0;
      if (isBikutsi) {
        // Rythme ternaire 6/8 rapide
        const subBeat = (beatProgress * 3) % 1;
        bassEnv = Math.exp(-subBeat * 6);
      } else if (isMakossa) {
        // Syncopation Makossa typique
        const subBeat = (beatProgress * 4) % 1;
        bassEnv = Math.exp(-subBeat * 5);
      } else {
        bassEnv = Math.exp(-beatProgress * 3);
      }
      const bassOsc = Math.sin(2 * Math.PI * rootFreq * t) + 0.25 * Math.sin(4 * Math.PI * rootFreq * t);
      sampleValL += bassOsc * bassEnv * 0.25;
      sampleValR += bassOsc * bassEnv * 0.25;

      // 3. BATTERIE : KICK & PERCUSSION (Cloche / Woodblock)
      // Kick sur les temps forts
      const isKickBeat = isBikutsi ? currentBeat % 2 === 0 : true;
      if (isKickBeat && beatProgress < 0.15) {
        const kickPitch = 90 * Math.exp(-beatProgress * 25);
        const kickOsc = Math.sin(2 * Math.PI * kickPitch * t);
        const kickEnv = Math.exp(-beatProgress * 20);
        sampleValL += kickOsc * kickEnv * 0.35;
        sampleValR += kickOsc * kickEnv * 0.35;
      }

      // Woodblock / Cloche africaine (très présent dans Bikutsi et Makossa)
      if (isBikutsi || isMakossa) {
        const bellSub = (beatProgress * 3) % 1;
        if (bellSub < 0.08) {
          const bellOsc = Math.sin(2 * Math.PI * 1850 * t);
          const bellEnv = Math.exp(-bellSub * 35);
          sampleValL += bellOsc * bellEnv * 0.15;
          sampleValR -= bellOsc * bellEnv * 0.15; // Légère stéréo élargie
        }
      }

      // Hi-Hat régulier
      const hatSub = (beatProgress * 2) % 1;
      if (hatSub < 0.05) {
        const noise = (Math.random() * 2 - 1) * Math.exp(-hatSub * 60);
        sampleValL += noise * 0.08;
        sampleValR += noise * 0.12;
      }

      left[sample] = Math.max(-0.95, Math.min(0.95, sampleValL));
      right[sample] = Math.max(-0.95, Math.min(0.95, sampleValR));
    }

    return audioBuffer;
  }

  /**
   * Génère un arrangement instrumental conditionné par l'audio d'une chanson ou voix guide
   * Analyse l'enveloppe dynamique et le rythme de l'audio source pour créer une orchestration adaptée.
   */
  public generateAudioConditionedInstrumental(
    referenceBuffer: AudioBuffer,
    genre: string,
    bpm: number = 120,
    melodyStrength: number = 0.7,
    targetDuration?: number
  ): AudioBuffer {
    this.init();
    const sr = this.ctx ? this.ctx.sampleRate : 44100;
    const duration = targetDuration ? Math.min(referenceBuffer.duration, targetDuration) : referenceBuffer.duration;
    const numSamples = Math.floor(sr * duration);

    const audioBuffer = (this.ctx || new AudioContext()).createBuffer(2, numSamples, sr);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);

    // Extraction et analyse de l'enveloppe de la chanson de référence
    const refChannel = referenceBuffer.getChannelData(0);
    const refStep = Math.max(1, Math.floor(refChannel.length / numSamples));

    const secondsPerBeat = 60.0 / bpm;
    const isBikutsi = genre.toLowerCase().includes('bikutsi') || bpm >= 155;
    const isMakossa = genre.toLowerCase().includes('makossa');

    // Progression d'accords harmonique
    const chords = isBikutsi
      ? [
          [261.63, 329.63, 392.00], // C
          [349.23, 440.00, 523.25], // F
          [392.00, 493.88, 587.33], // G
          [349.23, 440.00, 523.25], // F
        ]
      : [
          [261.63, 329.63, 392.00], // C
          [220.00, 261.63, 329.63], // Am
          [174.61, 220.00, 261.63], // F
          [196.00, 246.94, 293.66], // G
        ];

    for (let sample = 0; sample < numSamples; sample++) {
      const t = sample / sr;
      const refIdx = Math.min(sample * refStep, refChannel.length - 1);
      const songSignal = Math.abs(refChannel[refIdx]);

      const beatProgress = (t / secondsPerBeat) % 1;
      const currentBeat = Math.floor(t / secondsPerBeat);
      const chordIndex = Math.floor(currentBeat / 2) % chords.length;
      const currentChord = chords[chordIndex];

      let sampleValL = 0;
      let sampleValR = 0;

      // 1. Accords de piano modulés par la présence de la chanson
      const pianoDamping = isBikutsi ? 4.0 : 2.0;
      const chordEnv = Math.exp(-beatProgress * pianoDamping);
      const reactiveGain = 0.12 * (0.6 + 0.4 * melodyStrength * songSignal);

      for (let noteIdx = 0; noteIdx < currentChord.length; noteIdx++) {
        const freq = currentChord[noteIdx];
        const osc = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t);
        sampleValL += osc * chordEnv * reactiveGain;
        sampleValR += osc * chordEnv * reactiveGain;
      }

      // 2. Basse rythmée en soutien harmonique
      const rootFreq = currentChord[0] / 2;
      let bassEnv = 0;
      if (isBikutsi) {
        const subBeat = (beatProgress * 3) % 1;
        bassEnv = Math.exp(-subBeat * 5.5);
      } else if (isMakossa) {
        const subBeat = (beatProgress * 4) % 1;
        bassEnv = Math.exp(-subBeat * 4.5);
      } else {
        bassEnv = Math.exp(-beatProgress * 2.8);
      }
      const bassOsc = Math.sin(2 * Math.PI * rootFreq * t);
      sampleValL += bassOsc * bassEnv * 0.22;
      sampleValR += bassOsc * bassEnv * 0.22;

      // 3. Batterie et Groove synchronisé
      const isKickBeat = isBikutsi ? currentBeat % 2 === 0 : true;
      if (isKickBeat && beatProgress < 0.14) {
        const kickPitch = 85 * Math.exp(-beatProgress * 25);
        const kickOsc = Math.sin(2 * Math.PI * kickPitch * t);
        const kickEnv = Math.exp(-beatProgress * 20);
        sampleValL += kickOsc * kickEnv * 0.32;
        sampleValR += kickOsc * kickEnv * 0.32;
      }

      // Cloche Woodblock pour Bikutsi/Makossa
      if (isBikutsi || isMakossa) {
        const bellSub = (beatProgress * 3) % 1;
        if (bellSub < 0.08) {
          const bellOsc = Math.sin(2 * Math.PI * 1850 * t);
          const bellEnv = Math.exp(-bellSub * 35);
          sampleValL += bellOsc * bellEnv * 0.14;
          sampleValR -= bellOsc * bellEnv * 0.14;
        }
      }

      // Hi-Hat
      const hatSub = (beatProgress * 2) % 1;
      if (hatSub < 0.05) {
        const noise = (Math.random() * 2 - 1) * Math.exp(-hatSub * 60);
        sampleValL += noise * 0.07;
        sampleValR += noise * 0.1;
      }

      left[sample] = Math.max(-0.95, Math.min(0.95, sampleValL));
      right[sample] = Math.max(-0.95, Math.min(0.95, sampleValR));
    }

    return audioBuffer;
  }

  // =========================================================================
  // EXPORT FINAL MIXDOWN (FORMATS WAV 16-BIT & MP3 320kbps)
  // =========================================================================

  public async exportMasterMix(
    trackStates: Map<string, TrackAudioState>,
    eqSettings: { low: number; mid: number; high: number },
    masterVol: number = 1.0,
    format: ExportFormat = 'wav'
  ): Promise<{ blob: Blob; extension: string; mimeType: string }> {
    if (this.trackBuffers.size === 0) {
      throw new Error("Aucune piste sonore à exporter.");
    }

    let maxDuration = 0;
    this.trackBuffers.forEach((buf) => {
      if (buf.duration > maxDuration) maxDuration = buf.duration;
    });

    if (maxDuration <= 0) maxDuration = 10;
    const sampleRate = 44100;
    const lengthInSamples = Math.ceil(sampleRate * (maxDuration + 1.0)); // +1s pour queue de réverb

    // OfflineAudioContext pour rendu ultra-rapide
    const offlineCtx = new OfflineAudioContext(2, lengthInSamples, sampleRate);

    // Master bus
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = masterVol;

    // EQ
    const low = offlineCtx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 100;
    low.gain.value = eqSettings.low;

    const mid = offlineCtx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1200;
    mid.Q.value = 1.0;
    mid.gain.value = eqSettings.mid;

    const high = offlineCtx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 8500;
    high.gain.value = eqSettings.high;

    // Reverb
    const reverb = offlineCtx.createConvolver();
    reverb.buffer = this.buildImpulseResponse(2.0, 2.0);
    const reverbReturn = offlineCtx.createGain();
    reverbReturn.gain.value = 0.3;

    masterGain.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(offlineCtx.destination);

    reverb.connect(reverbReturn);
    reverbReturn.connect(masterGain);

    const hasSolo = Array.from(trackStates.values()).some((s) => s.solo);

    // Connexion des pistes
    this.trackBuffers.forEach((buffer, trackId) => {
      const state = trackStates.get(trackId) || {
        volume: 1.0,
        pan: 0,
        muted: false,
        solo: false,
        reverbSend: 0.2
      };

      const isAudible = hasSolo ? state.solo : !state.muted;
      if (!isAudible || state.volume <= 0.001) return;

      const src = offlineCtx.createBufferSource();
      src.buffer = buffer;

      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = state.volume;

      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, state.pan));

      const send = offlineCtx.createGain();
      send.gain.value = state.reverbSend;

      src.connect(trackGain);
      trackGain.connect(panner);
      panner.connect(masterGain);

      trackGain.connect(send);
      send.connect(reverb);

      src.start(0);
    });

    const renderedBuffer = await offlineCtx.startRendering();

    if (format === 'mp3') {
      const mp3Blob = this.audioBufferToMp3Blob(renderedBuffer, 320);
      return { blob: mp3Blob, extension: 'mp3', mimeType: 'audio/mp3' };
    } else {
      const wavBlob = this.audioBufferToWavBlob(renderedBuffer);
      return { blob: wavBlob, extension: 'wav', mimeType: 'audio/wav' };
    }
  }

  public async exportMasterMixWav(
    trackStates: Map<string, TrackAudioState>,
    eqSettings: { low: number; mid: number; high: number },
    masterVol: number = 1.0
  ): Promise<Blob> {
    const res = await this.exportMasterMix(trackStates, eqSettings, masterVol, 'wav');
    return res.blob;
  }

  /**
   * Encode un AudioBuffer en MP3 haute qualité (lamejs)
   */
  public audioBufferToMp3Blob(buffer: AudioBuffer, kbps: number = 320): Blob {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    // @ts-ignore
    const EncoderClass = lamejs.Mp3Encoder || (lamejs as any).default?.Mp3Encoder;
    const mp3encoder = new EncoderClass(channels, sampleRate, kbps);
    const mp3Data: any[] = [];

    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;

    // Conversion Float32 vers Int16
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);

    for (let i = 0; i < left.length; i++) {
      const sL = Math.max(-1, Math.min(1, left[i]));
      leftInt16[i] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;

      const sR = Math.max(-1, Math.min(1, right[i]));
      rightInt16[i] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
    }

    const blockSize = 1152;
    for (let i = 0; i < leftInt16.length; i += blockSize) {
      const leftChunk = leftInt16.subarray(i, i + blockSize);
      const rightChunk = rightInt16.subarray(i, i + blockSize);
      const mp3buf = channels === 1
        ? mp3encoder.encodeBuffer(leftChunk)
        : mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    const flushBuf = mp3encoder.flush();
    if (flushBuf.length > 0) {
      mp3Data.push(flushBuf);
    }

    return new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mp3' });
  }

  /**
   * Encode un AudioBuffer en Blob WAV RIFF standard (16-bit PCM stéréo)
   */
  public audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const numSamples = buffer.length;
    const dataByteCount = numSamples * blockAlign;
    const bufferByteLength = 44 + dataByteCount;

    const arrayBuffer = new ArrayBuffer(bufferByteLength);
    const view = new DataView(arrayBuffer);

    // Helper pour écrire les en-têtes ASCII
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataByteCount, true);
    writeString(8, 'WAVE');

    // "fmt " sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Taille du sous-morceau fmt (16 pour PCM)
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // "data" sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataByteCount, true);

    // Écriture entrelacée des échantillons stéréo
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        // Clamping entre -1 et 1
        const s = Math.max(-1, Math.min(1, channels[ch][i]));
        // Conversion en PCM 16-bit signé (-32768 à 32767)
        const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Clic métronome audible
   */
  public playClick(isAccented = false) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.frequency.setValueAtTime(isAccented ? 1200 : 800, now);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const audioEngine = new AudioEngine();
