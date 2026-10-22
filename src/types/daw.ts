export type TrackType = 'instrumental' | 'vocal' | 'stem_bass' | 'stem_drums' | 'stem_other';
export type GenerationMode = 'free' | 'audio_reference';

export interface PresetPrompt {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  prompt: string;
  description: string;
}

export interface AudioClip {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  duration: number;
  url?: string;
  createdAt: number;
}

export interface TrackAudioState {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  reverbSend: number;
}

export interface TrackState {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number; // 0.0 to 1.5 (1.0 = 0dB)
  pan: number;    // -1.0 to 1.0
  muted: boolean;
  solo: boolean;
  reverbSend: number; // 0.0 to 1.0
  clips: AudioClip[];
  activeClipIndex: number;
}

export interface SystemStatus {
  offline: boolean;
  device: string;
  modelsPath: string;
  outputsPath: string;
  musicgenLoaded: boolean;
  musicgenFiles: string[];
}
