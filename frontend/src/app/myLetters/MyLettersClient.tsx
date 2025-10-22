"use client";

import { useEffect, useMemo, useState } from 'react';
import { LetterViewer } from '../../features/writing-desk/components/LetterViewer';
import {
  useMyLettersQuery,
  type UseMyLettersQueryResult,
} from '../../features/my-letters/hooks/useMyLettersQuery';
import type { SavedLetterSummary } from '../../features/my-letters/api/listLetters';
import type { WritingDeskLetterTone } from '../../features/writing-desk/types';

const TONE_LABELS: Record<string, string> = {
  formal: 'Formal',
  polite_but_firm: 'Polite but firm',
  empathetic: 'Empathetic',
  urgent: 'Urgent',
  neutral: 'Neutral',
  highly_persuasive: 'Highly persuasive',
};

const PAGE_SIZE = 10;

function toIsoDate(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function resolveToneLabel(summary: SavedLetterSummary): string {
  const tone = (summary.metadata?.tone ?? summary.tone) as WritingDeskLetterTone | null;
  if (!tone) {
    return 'Not specified';
  }
  return TONE_LABELS[tone] ?? tone;
}

function resolveDisplayDate(summary: SavedLetterSummary): string {
  return (
    toIsoDate(typeof summary.metadata?.date === 'string' ? summary.metadata.date : null) ??
    toIsoDate(summary.createdAt) ??
    new Date().toISOString().slice(0, 10)
  );
}

function resolveMpName(summary: SavedLetterSummary): string | null {
  const mpName = summary.metadata?.mpName;
  return typeof mpName === 'string' && mpName.trim().length > 0 ? mpName.trim() : null;
}

export default function MyLettersClient() {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const queryParams = useMemo(
    () => ({
      from: fromDate || undefined,
      to: toDate || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [fromDate, toDate, page],
  );

  const { items, meta, isLoading, isFetching, error, refetch }: UseMyLettersQueryResult = useMyLettersQuery(queryParams);

  useEffect(() => {
    if (!meta || meta.totalPages <= 0) {
      return;
    }
    if (page > meta.totalPages) {
      setPage(meta.totalPages);
    }
  }, [meta, page]);

  const letters = items;
  const hasLetters = letters.length > 0;
  const showEmpty = !isLoading && !isFetching && !hasLetters && !error;

  const canGoFirst = meta.page > 1;
  const canGoPrev = meta.hasPrevious && meta.page > 1;
  const canGoNext = meta.hasNext && meta.page < meta.totalPages;
  const canGoLast = meta.totalPages > 0 && meta.page < meta.totalPages;

  return (
    <main className="hero-section">
      <section className="card">
        <div className="container" style={{ paddingTop: 32, paddingBottom: 32 }}>
          <div style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>My letters</h1>
              <p style={{ color: '#4b5563', maxWidth: 640 }}>
                Browse, download, or copy the letters you&apos;ve previously drafted in the writing desk.
              </p>
            </header>

            <section aria-labelledby="filters-heading" style={{ marginBottom: 32 }}>
              <h2 id="filters-heading" style={{ fontSize: '1.25rem', marginBottom: 12 }}>
                Filter by date saved
              </h2>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  alignItems: 'flex-end',
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>From</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => {
                      setFromDate(event.target.value);
                      setPage(1);
                    }}
                    aria-label="Filter letters from date"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>To</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => {
                      setToDate(event.target.value);
                      setPage(1);
                    }}
                    aria-label="Filter letters to date"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    setPage(1);
                    void refetch();
                  }}
                  style={{ height: 40 }}
                >
                  Reset filters
                </button>
              </div>
            </section>

            <nav aria-label="Saved letters pagination" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage(1)}
                  disabled={!canGoFirst}
                  aria-disabled={!canGoFirst}
                  aria-label="Go to first page"
                >
                  {'<<'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={!canGoPrev}
                  aria-disabled={!canGoPrev}
                  aria-label="Go to previous page"
                >
                  {'<'}
                </button>
                <span aria-live="polite" style={{ fontWeight: 600 }}>
                  Page {meta.page} of {Math.max(1, meta.totalPages)}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!canGoNext}
                  aria-disabled={!canGoNext}
                  aria-label="Go to next page"
                >
                  {'>'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage(meta.totalPages || 1)}
                  disabled={!canGoLast}
                  aria-disabled={!canGoLast}
                  aria-label="Go to last page"
                >
                  {'>>'}
                </button>
              </div>
            </nav>

            {isFetching && !isLoading && (
              <div role="status" aria-live="polite" style={{ marginBottom: 24 }}>
                Updating results…
              </div>
            )}

            {isLoading && (
              <div role="status" aria-live="polite" style={{ marginBottom: 24 }}>
                Loading your letters…
              </div>
            )}

            {error && (
              <div role="alert" style={{ marginBottom: 24, color: '#b91c1c' }}>
                {error.message || 'We could not load your saved letters. Please try again later.'}
              </div>
            )}

            {showEmpty && (
              <p style={{ marginBottom: 24, color: '#4b5563' }}>
                You haven&apos;t saved any letters yet. Draft one in the writing desk and save it to revisit it here.
              </p>
            )}

            <div style={{ display: 'grid', gap: 24 }}>
              {letters.map((letter) => {
                const mpName = resolveMpName(letter);
                const displayDate = resolveDisplayDate(letter);
                const toneLabel = resolveToneLabel(letter);

                return (
                  <article
                    key={letter.id}
                    className="card"
                    style={{ padding: 24 }}
                  >
                    <header style={{ marginBottom: 16 }}>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: 4 }}>
                        {mpName ? `Letter to ${mpName}` : 'Drafted letter'}
                      </h3>
                      <p style={{ margin: 0, color: '#6b7280' }}>
                        Tone: {toneLabel} · Saved on {displayDate}
                      </p>
                      {letter.responseId && (
                        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '0.9rem' }}>
                          Reference ID: {letter.responseId}
                        </p>
                      )}
                    </header>
                    <LetterViewer letterHtml={letter.letterHtml} metadata={letter.metadata} />
                  </article>
                );
              })}
            </div>

            <nav aria-label="Saved letters pagination" style={{ marginTop: 32 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage(1)}
                  disabled={!canGoFirst}
                  aria-disabled={!canGoFirst}
                  aria-label="Go to first page"
                >
                  {'<<'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={!canGoPrev}
                  aria-disabled={!canGoPrev}
                  aria-label="Go to previous page"
                >
                  {'<'}
                </button>
                <span aria-live="polite" style={{ fontWeight: 600 }}>
                  Page {meta.page} of {Math.max(1, meta.totalPages)}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!canGoNext}
                  aria-disabled={!canGoNext}
                  aria-label="Go to next page"
                >
                  {'>'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage(meta.totalPages || 1)}
                  disabled={!canGoLast}
                  aria-disabled={!canGoLast}
                  aria-label="Go to last page"
                >
                  {'>>'}
                </button>
              </div>
            </nav>
          </div>
        </div>
      </section>
    </main>
  );
}
