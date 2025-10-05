export interface TranscriptionRequest {
  audioData: string; // Base64 encoded audio
  model?: 'whisper-1' | 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe';
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  prompt?: string;
  language?: string;
}

export interface TranscriptionResponse {
  model: string;
  text: string;
  remainingCredits: number;
}

export interface StreamingTranscriptionRequest {
  audioData: string; // Base64 encoded audio
  model?: 'whisper-1' | 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe';
  prompt?: string;
  language?: string;
}

export interface StreamingTranscriptionEvent {
  type: 'delta' | 'complete' | 'error';
  text?: string;
  remainingCredits?: number;
  message?: string;
}

export async function transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResponse> {
  const response = await fetch('/api/ai/transcription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Transcription failed: ${errorText}`);
  }

  return response.json();
}

export function streamTranscription(
  request: StreamingTranscriptionRequest,
  onEvent: (event: StreamingTranscriptionEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): () => void {
  const eventSource = new EventSource('/api/ai/transcription/stream', {
    withCredentials: true,
  });

  // Note: EventSource doesn't support POST with body, so we'll need to use a different approach
  // For now, we'll use the regular POST endpoint and simulate streaming
  // In a real implementation, you'd want to modify the backend to support GET with query params
  
  let isAborted = false;

  const abort = () => {
    isAborted = true;
    eventSource.close();
  };

  // For now, use the regular transcription endpoint and simulate streaming
  transcribeAudio({
    audioData: request.audioData,
    model: request.model,
    responseFormat: 'text',
    prompt: request.prompt,
    language: request.language,
  })
    .then((result) => {
      if (isAborted) return;
      
      // Simulate streaming by sending the text in chunks
      const words = result.text.split(' ');
      let currentText = '';
      
      const streamInterval = setInterval(() => {
        if (isAborted || words.length === 0) {
          clearInterval(streamInterval);
          if (!isAborted) {
            onEvent({ type: 'complete', text: result.text, remainingCredits: result.remainingCredits });
            onComplete?.();
          }
          return;
        }
        
        const word = words.shift();
        if (word) {
          currentText += (currentText ? ' ' : '') + word;
          onEvent({ type: 'delta', text: currentText });
        }
      }, 100); // Stream words every 100ms
    })
    .catch((error) => {
      if (!isAborted) {
        onError?.(error);
      }
    });

  return abort;
}
