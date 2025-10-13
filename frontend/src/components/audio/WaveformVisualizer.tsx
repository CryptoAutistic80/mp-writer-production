'use client';

import { useEffect, useRef, useState } from 'react';

interface WaveformVisualizerProps {
  isRecording: boolean;
  audioContext?: AudioContext;
  analyser?: AnalyserNode;
  className?: string;
}

export function WaveformVisualizer({ 
  isRecording, 
  audioContext, 
  analyser, 
  className = '' 
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [bars, setBars] = useState<number[]>([]);

  useEffect(() => {
    if (!isRecording || !analyser || !audioContext) {
      setBars([]);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;

      analyser.getByteFrequencyData(dataArray);

      // Calculate bar heights from frequency data
      const barCount = 20; // Number of bars to display
      const barWidth = canvas.width / barCount;
      const newBars: number[] = [];

      for (let i = 0; i < barCount; i++) {
        const start = Math.floor((i / barCount) * bufferLength);
        const end = Math.floor(((i + 1) / barCount) * bufferLength);
        
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += dataArray[j];
        }
        
        const average = sum / (end - start);
        const normalizedHeight = Math.min(average / 128, 1); // Normalize to 0-1
        newBars.push(normalizedHeight);
      }

      setBars(newBars);
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isRecording, analyser, audioContext]);

  // Generate static bars when not recording
  useEffect(() => {
    if (!isRecording) {
      setBars(new Array(20).fill(0.1));
    }
  }, [isRecording]);

  return (
    <div className={`waveform-container ${className}`}>
      <div className="waveform-bars">
        {bars.map((height, index) => (
          <div
            key={index}
            className={`waveform-bar ${isRecording ? 'waveform-bar--active' : ''}`}
            style={{
              height: `${Math.max(height * 100, 5)}%`,
              animationDelay: `${index * 50}ms`,
            }}
          />
        ))}
      </div>
      <style>{`
        .waveform-container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          width: 100%;
          padding: 0 8px;
        }

        .waveform-bars {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 2px;
          height: 100%;
          width: 100%;
        }

        .waveform-bar {
          width: 3px;
          background: #6b7280;
          border-radius: 1.5px;
          transition: height 0.1s ease-out;
          min-height: 2px;
        }

        .waveform-bar--active {
          background: #2563eb;
          animation: waveform-pulse 0.5s ease-in-out infinite alternate;
        }

        @keyframes waveform-pulse {
          0% {
            opacity: 0.6;
          }
          100% {
            opacity: 1;
          }
        }

        canvas {
          display: none;
        }
      `}</style>
      <canvas ref={canvasRef} width={400} height={40} />
    </div>
  );
}
