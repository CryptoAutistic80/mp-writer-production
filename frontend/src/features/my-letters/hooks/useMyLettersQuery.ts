"use client";

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchMyLetters, type MyLettersListMeta, type MyLettersListParams } from '../api/listLetters';

const QUERY_KEY = ['my-letters'] as const;
const DEFAULT_PAGE_SIZE = 10;

function normalizeParams(params: MyLettersListParams | undefined) {
  const page = typeof params?.page === 'number' && Number.isFinite(params.page) ? params.page : 1;
  const pageSize =
    typeof params?.pageSize === 'number' && Number.isFinite(params.pageSize) ? params.pageSize : DEFAULT_PAGE_SIZE;
  const from = params?.from ?? null;
  const to = params?.to ?? null;

  return { page, pageSize, from, to } as const;
}

export function useMyLettersQuery(params: MyLettersListParams = {}) {
  const normalized = useMemo(() => normalizeParams(params), [params]);

  const query = useQuery({
    queryKey: [...QUERY_KEY, normalized],
    queryFn: () => fetchMyLetters({
      page: normalized.page,
      pageSize: normalized.pageSize,
      from: normalized.from ?? undefined,
      to: normalized.to ?? undefined,
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const fallbackMeta: MyLettersListMeta = useMemo(
    () => ({
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalItems: 0,
      totalPages: 1,
      hasNext: false,
      hasPrevious: normalized.page > 1,
    }),
    [normalized.page, normalized.pageSize],
  );

  return {
    items: query.data?.items ?? [],
    meta: query.data?.meta ?? fallbackMeta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  } as const;
}

export type UseMyLettersQueryResult = ReturnType<typeof useMyLettersQuery>;
