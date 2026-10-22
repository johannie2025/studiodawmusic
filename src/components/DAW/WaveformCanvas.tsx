import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  color?: string;
  height?: number;
  onSeek?: (time: number) => void;
  isRecording?: boolean;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  buffer,
  currentTime,
  duration,
  color = '#38bdf8', // sky-400
  height = 72,
  onSeek,
  isRecording = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const canvasHeight = height;

    canvas.width = width * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, canvasHeight);

    // Grid lines
    ctx.strokeStyle = '#27272a'; // zinc-800
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Center baseline
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(width, canvasHeight / 2);
    // Vertical bar subdivisions (grid)
    for (let x = 0; x < width; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
    }
    ctx.stroke();

    if (!buffer) {
      if (isRecording) {
        // Live recording placeholder pulse
        ctx.fillStyle = '#ef4444';
        ctx.font = '11px sans-serif';
        ctx.fillText('🔴 Enregistrement de la voix en direct...', 12, canvasHeight / 2 + 4);
      } else {
        // Empty state
        ctx.fillStyle = '#52525b';
        ctx.font = '11px sans-serif';
        ctx.fillText('Aucun signal audio chargé sur cette piste', 12, canvasHeight / 2 + 4);
      }
      return;
    }

    // Draw waveform bars
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = canvasHeight / 2;

    ctx.fillStyle = color;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * step;
      const end = Math.min(start + step, data.length);

      for (let j = start; j < end; j++) {
        const datum = data[j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const barHeight = Math.max(2, (max - min) * amp * 0.9);
      const y = amp - barHeight / 2;

      // Color gradation for played portion vs future portion
      const currentX = duration > 0 ? (currentTime / duration) * width : 0;
      if (i < currentX) {
        ctx.fillStyle = color;
      } else {
        ctx.fillStyle = '#71717a'; // zinc-500
      }

      ctx.fillRect(i, y, 1, barHeight);
    }

    // Playhead cursor line
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, canvasHeight);
      ctx.stroke();

      // Playhead handle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(playheadX, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [buffer, currentTime, duration, color, height, isRecording]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !canvasRef.current || duration <= 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(percent * duration);
  };

  return (
    <div className="w-full relative group">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{ height: `${height}px` }}
        className="w-full bg-zinc-950/80 rounded border border-zinc-800/80 cursor-pointer block hover:border-zinc-700 transition-colors"
      />
    </div>
  );
};
