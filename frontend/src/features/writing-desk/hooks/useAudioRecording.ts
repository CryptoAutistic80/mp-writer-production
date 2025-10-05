import { useCallback, useRef, useState } from 'react';

export interface AudioRecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
}

export interface AudioRecordingControls {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearRecording: () => void;
  getAudioData: () => Promise<string | null>; // Returns base64 encoded audio
}

const MAX_RECORDING_DURATION = 5 * 60 * 1000; // 5 minutes
const CHUNK_INTERVAL = 100; // Update duration every 100ms

export function useAudioRecording(): AudioRecordingState & AudioRecordingControls {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearRecording = useCallback(() => {
    setError(null);
    setAudioBlob(null);
    setDuration(0);
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    chunksRef.current = [];
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      clearRecording();

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Optimal for speech recognition
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder with WebM format (supported by OpenAI)
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = (event) => {
        setError('Recording failed. Please try again.');
        console.error('MediaRecorder error:', event);
      };

      // Start recording
      mediaRecorder.start(CHUNK_INTERVAL);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Update duration periodically
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDuration(elapsed);

        // Auto-stop at max duration
        if (elapsed >= MAX_RECORDING_DURATION) {
          stopRecording();
        }
      }, CHUNK_INTERVAL);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      console.error('Error starting recording:', err);
    }
  }, [clearRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  const getAudioData = useCallback(async (): Promise<string | null> => {
    if (!audioBlob) return null;

    setIsProcessing(true);
    setError(null);

    try {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get base64 data
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to read audio file'));
        };
        
        reader.readAsDataURL(audioBlob);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process audio');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [audioBlob]);

  return {
    isRecording,
    isProcessing,
    error,
    audioBlob,
    audioUrl,
    duration,
    startRecording,
    stopRecording,
    clearRecording,
    getAudioData,
  };
}
