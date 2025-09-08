"use client";

import { useCallback, useMemo, useState } from 'react';

type Lookup = {
  constituency: string;
  mp?: {
    id?: number;
    name?: string;
    party?: string;
    portraitUrl?: string;
    since?: string;
    email?: string;
    twitter?: string;
    website?: string;
    parliamentaryAddress?: string;
  } | null;
};

export default function MpFetch() {
  const [postcode, setPostcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Lookup | null>(null);

  const normalized = useMemo(() => postcode.replace(/\s+/g, '').toUpperCase(), [postcode]);
  const valid = useMemo(() => /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(normalized), [normalized]);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setData(null);
    if (!valid) {
      setError('Please enter a valid UK postcode.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/mps/lookup?postcode=${encodeURIComponent(postcode)}`, { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Lookup failed');
        throw new Error(text || 'Lookup failed');
      }
      const json = (await res.json()) as Lookup;
      setData(json);
    } catch (err: any) {
      setError('We couldn\'t find a match for that postcode.');
    } finally {
      setLoading(false);
    }
  }, [postcode, valid]);

  return (
    <div className="container">
      <h2 id="find-mp-heading" className="section-title">Find your MP</h2>
      <p className="section-sub">Enter your UK postcode to look up your constituency MP.</p>

      <form className="form-grid" aria-labelledby="find-mp-heading" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="postcode" className="label">Postcode</label>
          <input
            id="postcode"
            name="postcode"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="e.g. SW1A 1AA"
            className="input"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            disabled={loading}
            aria-invalid={!valid && postcode.length > 0}
          />
        </div>

        <div className="actions">
          <button type="submit" className="btn-primary" disabled={!valid || loading} aria-busy={loading}>
            {loading ? 'Finding…' : 'Find my MP'}
          </button>
          <p className="fineprint" style={{ marginLeft: 12 }}>We’ll never post anywhere on your behalf.</p>
        </div>

        <div className="status" aria-live="polite">
          {error && <p style={{ color: '#b91c1c', marginTop: 10 }}>{error}</p>}
        </div>

        <div className="result" aria-live="polite">
          {!data && !error && (
            <div className="result-placeholder">Your MP will appear here after lookup.</div>
          )}
          {data && (
            <article className="mp-card">
              {data.mp?.portraitUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.mp.portraitUrl} alt="" className="mp-portrait" />
              )}
              <div className="mp-body">
                <header>
                  <div className="mp-name">{data.mp?.name ?? 'Member of Parliament'}</div>
                  <div className="mp-meta">{data.constituency} · {data.mp?.party ?? 'Party'}{data.mp?.since ? ` · MP since ${new Date(data.mp.since).getFullYear()}` : ''}</div>
                </header>
                {(data.mp?.email || data.mp?.twitter || data.mp?.website) && (
                  <ul className="mp-links">
                    {data.mp?.email && (
                      <li><a href={`mailto:${data.mp.email}`}>Email</a></li>
                    )}
                    {data.mp?.twitter && (
                      <li><a target="_blank" rel="noreferrer" href={`https://twitter.com/${data.mp.twitter.replace(/^@/, '')}`}>Twitter</a></li>
                    )}
                    {data.mp?.website && (
                      <li><a target="_blank" rel="noreferrer" href={data.mp.website}>Website</a></li>
                    )}
                  </ul>
                )}
                {data.mp?.parliamentaryAddress && (
                  <p className="mp-address">{data.mp.parliamentaryAddress}</p>
                )}
              </div>
            </article>
          )}
        </div>
      </form>
    </div>
  );
}
