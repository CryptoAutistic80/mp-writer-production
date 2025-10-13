import { WritingDeskLetterPayload, WritingDeskLetterTone } from '../types';

export interface StartLetterResponse {
  jobId: string;
  streamPath: string;
}

export async function startLetterComposition(input: {
  jobId?: string;
  tone: WritingDeskLetterTone;
  resume?: boolean;
}): Promise<StartLetterResponse> {
  const res = await fetch('/api/writing-desk/jobs/active/letter/start', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: input.jobId, tone: input.tone, resume: input.resume === true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  const data = (await res.json().catch(() => null)) as StartLetterResponse | null;
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
  const res = await fetch('/api/user/saved-letters', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responseId: input.responseId,
      letterHtml: input.letterHtml,
      metadata: input.metadata,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  const data = (await res.json().catch(() => null)) as SavedLetterResource | null;
  if (!data || typeof data.id !== 'string') {
    throw new Error('We could not save your letter. Please try again.');
  }

  return data;
}

export async function fetchSavedLetters(responseIds: string[]): Promise<SavedLetterResource[]> {
  const res = await fetch('/api/user/saved-letters/lookup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responseIds }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  const data = (await res.json().catch(() => null)) as SavedLetterResource[] | null;
  if (!Array.isArray(data)) {
    throw new Error('We could not check saved letters. Please try again.');
  }

  return data;
}
