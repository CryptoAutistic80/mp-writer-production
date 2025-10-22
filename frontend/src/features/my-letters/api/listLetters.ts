import type { WritingDeskLetterPayload } from '../../writing-desk/types';

export interface MyLettersListParams {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface MyLettersListMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface SavedLetterSummary {
  id: string;
  responseId: string;
  letterHtml: string;
  tone: string | null;
  references: string[];
  metadata: Partial<WritingDeskLetterPayload> & Record<string, unknown>;
  rawJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyLettersListResponse {
  items: SavedLetterSummary[];
  meta: MyLettersListMeta;
}

function toQueryString(params: MyLettersListParams): string {
  const searchParams = new URLSearchParams();
  if (params.from) {
    searchParams.set('from', params.from);
  }
  if (params.to) {
    searchParams.set('to', params.to);
  }
  if (typeof params.page === 'number' && Number.isFinite(params.page)) {
    searchParams.set('page', String(Math.max(1, Math.floor(params.page))));
  }
  if (typeof params.pageSize === 'number' && Number.isFinite(params.pageSize)) {
    searchParams.set('pageSize', String(Math.max(1, Math.floor(params.pageSize))));
  }
  const query = searchParams.toString();
  return query.length > 0 ? `?${query}` : '';
}

function normalizeSavedLetter(input: any): SavedLetterSummary | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const id = typeof input.id === 'string' ? input.id : typeof input._id === 'string' ? input._id : null;
  if (!id) {
    return null;
  }

  const responseId = typeof input.responseId === 'string' ? input.responseId : '';
  const letterHtml = typeof input.letterHtml === 'string' ? input.letterHtml : '';
  const tone = typeof input.tone === 'string' ? input.tone : null;
  const references = Array.isArray(input.references)
    ? input.references.filter((item: unknown): item is string => typeof item === 'string')
    : [];
  const metadata =
    input.metadata && typeof input.metadata === 'object'
      ? (input.metadata as Partial<WritingDeskLetterPayload> & Record<string, unknown>)
      : ({} as Partial<WritingDeskLetterPayload> & Record<string, unknown>);
  const rawJson = typeof input.rawJson === 'string' ? input.rawJson : null;
  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString();
  const updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : createdAt;

  return {
    id,
    responseId,
    letterHtml,
    tone,
    references,
    metadata,
    rawJson,
    createdAt,
    updatedAt,
  };
}

function extractPaginationMeta(json: any, fallback: { page: number; pageSize: number }): MyLettersListMeta {
  const source = json && typeof json === 'object' && json.pagination && typeof json.pagination === 'object'
    ? json.pagination
    : json;

  const pageRaw = source?.page;
  const pageSizeRaw = source?.pageSize;
  const totalItemsRaw = source?.totalItems ?? source?.total ?? source?.count;
  const totalPagesRaw = source?.totalPages ?? source?.pages;
  const hasNextRaw = source?.hasNext ?? source?.hasMore ?? source?.hasNextPage;
  const hasPreviousRaw = source?.hasPrevious ?? source?.hasPrev ?? source?.hasPreviousPage;

  const page = typeof pageRaw === 'number' && Number.isFinite(pageRaw) ? pageRaw : fallback.page;
  const pageSize =
    typeof pageSizeRaw === 'number' && Number.isFinite(pageSizeRaw) ? pageSizeRaw : fallback.pageSize;
  const totalItems =
    typeof totalItemsRaw === 'number' && Number.isFinite(totalItemsRaw)
      ? totalItemsRaw
      : Math.max(page * pageSize, fallback.pageSize);
  const totalPages =
    typeof totalPagesRaw === 'number' && Number.isFinite(totalPagesRaw)
      ? totalPagesRaw
      : Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const hasNext = typeof hasNextRaw === 'boolean' ? hasNextRaw : page < totalPages;
  const hasPrevious = typeof hasPreviousRaw === 'boolean' ? hasPreviousRaw : page > 1;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNext,
    hasPrevious,
  };
}

export async function fetchMyLetters(params: MyLettersListParams = {}): Promise<MyLettersListResponse> {
  const query = toQueryString(params);
  const res = await fetch(`/api/user/saved-letters${query}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  const json = await res.json().catch(() => null as any);
  const rawItems = Array.isArray(json?.items)
    ? json.items
    : Array.isArray(json?.letters)
      ? json.letters
      : Array.isArray(json?.data)
        ? json.data
        : [];

  const items = rawItems
    .map((item: unknown) => normalizeSavedLetter(item))
    .filter((item: SavedLetterSummary | null): item is SavedLetterSummary => item !== null);

  const meta = extractPaginationMeta(json, {
    page: typeof params.page === 'number' && Number.isFinite(params.page) ? params.page : 1,
    pageSize: typeof params.pageSize === 'number' && Number.isFinite(params.pageSize) ? params.pageSize : items.length || 10,
  });

  return {
    items,
    meta,
  };
}
