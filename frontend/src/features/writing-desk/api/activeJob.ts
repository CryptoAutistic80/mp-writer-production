import { ActiveWritingDeskJob, UpsertActiveWritingDeskJobPayload } from '../types';

const ACTIVE_JOB_ENDPOINT = '/api/writing-desk/jobs/active';

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const data = (await res.json().catch(() => null)) as T;
  return data;
}

export async function fetchActiveWritingDeskJob(): Promise<ActiveWritingDeskJob | null> {
  const res = await fetch(ACTIVE_JOB_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 404) {
    return null;
  }

  const data = await handleResponse<ActiveWritingDeskJob | null>(res);
  return data ?? null;
}

export async function upsertActiveWritingDeskJob(
  payload: UpsertActiveWritingDeskJobPayload,
): Promise<ActiveWritingDeskJob> {
  const res = await fetch(ACTIVE_JOB_ENDPOINT, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await handleResponse<ActiveWritingDeskJob>(res);
  return data;
}

export async function clearActiveWritingDeskJob(): Promise<void> {
  const res = await fetch(ACTIVE_JOB_ENDPOINT, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  await handleResponse(res);
}
