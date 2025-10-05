'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WaveformVisualizer } from './WaveformVisualizer';

interface MicButtonProps {
  onTranscriptionComplete: (text: string) => void;
  onTranscriptionStart?: () => void;
  onTranscriptionError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function MicButton({
  onTranscriptionComplete,
  onTranscriptionStart,
  onTranscriptionError,
  disabled = false,
  className = '',
  size = 'md',
}: MicButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [transcriptionText, setTranscriptionText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setupAudioContext = useCallback(async (mediaStream: MediaStream) => {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = context.createMediaStreamSource(mediaStream);
      const analyserNode = context.createAnalyser();
      
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.8;
      
      source.connect(analyserNode);
      
      setAudioContext(context);
      setAnalyser(analyserNode);
      audioContextRef.current = context;
    } catch (err) {
      console.warn('Failed to setup audio context:', err);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      clearError();
      onTranscriptionStart?.();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      setStream(mediaStream);
      await setupAudioContext(mediaStream);

      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        
        try {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          
          // Convert to base64
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          // Send to transcription API
          const response = await fetch('/api/ai/transcription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              audioData: base64Data,
              model: 'gpt-4o-mini-transcribe',
              responseFormat: 'text',
            }),
          });

          if (!response.ok) {
            throw new Error(`Transcription failed: ${response.statusText}`);
          }

          const result = await response.json();
          setTranscriptionText(result.text);
          onTranscriptionComplete(result.text);
          
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Transcription failed';
          setError(errorMessage);
          onTranscriptionError?.(errorMessage);
        } finally {
          setIsProcessing(false);
        }

        // Cleanup
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
          audioContextRef.current = null;
          setAudioContext(null);
          setAnalyser(null);
        }
      };

      mediaRecorder.onerror = (event) => {
        setError('Recording failed');
        console.error('MediaRecorder error:', event);
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      onTranscriptionError?.(errorMessage);
    }
  }, [clearError, onTranscriptionStart, onTranscriptionError, onTranscriptionComplete, setupAudioContext, stream, audioContext]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleClick = useCallback(() => {
    if (disabled || isProcessing) return;
    
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [disabled, isProcessing, isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stream]);

  const sizeClasses = {
    sm: 'mic-button--sm',
    md: 'mic-button--md',
    lg: 'mic-button--lg',
  };

  const buttonState = isProcessing ? 'processing' : isRecording ? 'recording' : 'idle';

  return (
    <div className={`mic-button-container ${className}`}>
      <button
        type="button"
        className={`mic-button mic-button--${buttonState} ${sizeClasses[size]}`}
        onClick={handleClick}
        disabled={disabled || isProcessing}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        <div className="mic-button__icon">
          {isProcessing ? (
            <div className="mic-button__spinner" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </div>
        
        {isRecording && (
          <div className="mic-button__waveform">
            <WaveformVisualizer
              isRecording={isRecording}
              audioContext={audioContext}
              analyser={analyser}
            />
          </div>
        )}
      </button>

      {error && (
        <div className="mic-button__error" role="alert">
          {error}
        </div>
      )}

      <style jsx>{`
        .mic-button-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .mic-button {
          position: relative;
          border: none;
          border-radius: 50%;
          background: #f3f4f6;
          color: #6b7280;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .mic-button:hover:not(:disabled) {
          background: #e5e7eb;
          color: #374151;
        }

        .mic-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mic-button--recording {
          background: #dc2626;
          color: white;
          animation: mic-pulse 1.5s ease-in-out infinite;
        }

        .mic-button--processing {
          background: #2563eb;
          color: white;
        }

        .mic-button--sm {
          width: 32px;
          height: 32px;
        }

        .mic-button--md {
          width: 40px;
          height: 40px;
        }

        .mic-button--lg {
          width: 48px;
          height: 48px;
        }

        .mic-button__icon {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mic-button__icon svg {
          width: 60%;
          height: 60%;
        }

        .mic-button__waveform {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }

        .mic-button__spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .mic-button__error {
          font-size: 0.75rem;
          color: #dc2626;
          text-align: center;
          max-width: 200px;
        }

        @keyframes mic-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mic-button--recording {
            animation: none;
          }
          
          .mic-button__spinner {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
