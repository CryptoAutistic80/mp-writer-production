'use client';

export type MeUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  credits?: number | null;
} | null;

export async function fetchMeWithRefresh(): Promise<MeUser> {
  const opts: RequestInit = { cache: 'no-store', credentials: 'include' };
  try {
    let res = await fetch('/api/auth/me', opts);
    if (res.status === 401) {
      const r = await fetch('/api/auth/refresh', opts);
      if (r.ok) {
        res = await fetch('/api/auth/me', opts);
      }
    }
    if (!res.ok) return null;
    return (await res.json()) as MeUser;
  } catch {
    return null;
  }
}

