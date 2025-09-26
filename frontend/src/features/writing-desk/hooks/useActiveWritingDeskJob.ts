'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearActiveWritingDeskJob,
  fetchActiveWritingDeskJob,
  upsertActiveWritingDeskJob,
} from '../api/activeJob';
import { ActiveWritingDeskJob, UpsertActiveWritingDeskJobPayload } from '../types';

const queryKey = ['writing-desk', 'active-job'] as const;

export function useActiveWritingDeskJob() {
  const queryClient = useQueryClient();

  const activeJobQuery = useQuery({
    queryKey,
    queryFn: fetchActiveWritingDeskJob,
    staleTime: 0,
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: UpsertActiveWritingDeskJobPayload) => upsertActiveWritingDeskJob(payload),
    onSuccess: (job: ActiveWritingDeskJob) => {
      queryClient.setQueryData(queryKey, job);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearActiveWritingDeskJob(),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
    },
  });

  return {
    activeJob: activeJobQuery.data ?? null,
    isLoading: activeJobQuery.isLoading,
    refetch: activeJobQuery.refetch,
    saveJob: upsertMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
    clearJob: clearMutation.mutateAsync,
    isClearing: clearMutation.isPending,
    error: activeJobQuery.error as Error | null,
  } as const;
}

export type UseActiveWritingDeskJobResult = ReturnType<typeof useActiveWritingDeskJob>;
