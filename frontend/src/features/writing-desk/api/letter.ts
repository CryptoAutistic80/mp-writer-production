import { WritingDeskLetterTone } from '../types';

export interface StartLetterResponse {
  jobId: string;
  streamPath: string;
}

export async function startLetterComposition(input: {
  jobId?: string;
  tone: WritingDeskLetterTone;
}): Promise<StartLetterResponse> {
  const res = await fetch('/api/writing-desk/jobs/active/letter/start', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: input.jobId, tone: input.tone }),
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
