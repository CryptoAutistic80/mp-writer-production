import { ActiveWritingDeskJob, UpsertActiveWritingDeskJobPayload } from '../types';
import { apiClient } from '../../../lib/api-client';

const ACTIVE_JOB_ENDPOINT = '/api/writing-desk/jobs/active';

export async function fetchActiveWritingDeskJob(): Promise<ActiveWritingDeskJob | null> {
  try {
    const data = await apiClient.get<ActiveWritingDeskJob | null>(ACTIVE_JOB_ENDPOINT);
    return data ?? null;
  } catch (error: any) {
    // Check if it's a 404 error
    if (error?.message && typeof error.message === 'string') {
      if (error.message.includes('404') || error.message.includes('Not Found')) {
        return null;
      }
    }
    throw error;
  }
}

export async function upsertActiveWritingDeskJob(
  payload: UpsertActiveWritingDeskJobPayload,
): Promise<ActiveWritingDeskJob> {
  const data = await apiClient.put<ActiveWritingDeskJob>(ACTIVE_JOB_ENDPOINT, payload);
  return data;
}

export async function clearActiveWritingDeskJob(): Promise<void> {
  await apiClient.delete(ACTIVE_JOB_ENDPOINT);
}
