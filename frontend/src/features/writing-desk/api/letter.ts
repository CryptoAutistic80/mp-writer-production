import { WritingDeskLetterPayload, WritingDeskLetterTone } from '../types';
import { apiClient } from '../../../lib/api-client';

export interface StartLetterResponse {
  jobId: string;
  streamPath: string;
}

export async function startLetterComposition(input: {
  jobId?: string;
  tone: WritingDeskLetterTone;
  resume?: boolean;
}): Promise<StartLetterResponse> {
  const data = await apiClient.post<StartLetterResponse>('/api/writing-desk/jobs/active/letter/start', {
    jobId: input.jobId,
    tone: input.tone,
    resume: input.resume === true,
  });

  if (!data || typeof data.jobId !== 'string' || typeof data.streamPath !== 'string') {
    throw new Error('We could not start letter composition. Please try again.');
  }

  return data;
}

export interface SaveLetterInput {
  responseId: string;
  letterHtml: string;
  metadata: WritingDeskLetterPayload;
}

export interface SavedLetterResource {
  id: string;
  responseId: string;
  letterHtml: string;
  tone: WritingDeskLetterTone | null;
  references: string[];
  metadata: WritingDeskLetterPayload;
  rawJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function saveLetter(input: SaveLetterInput): Promise<SavedLetterResource> {
  const data = await apiClient.post<SavedLetterResource>('/api/user/saved-letters', {
    responseId: input.responseId,
    letterHtml: input.letterHtml,
    metadata: input.metadata,
  });

  if (!data || typeof data.id !== 'string') {
    throw new Error('We could not save your letter. Please try again.');
  }

  return data;
}

export async function fetchSavedLetters(responseIds: string[]): Promise<SavedLetterResource[]> {
  const data = await apiClient.post<SavedLetterResource[]>('/api/user/saved-letters/lookup', {
    responseIds,
  });

  if (!Array.isArray(data)) {
    throw new Error('We could not check saved letters. Please try again.');
  }

  return data;
}
