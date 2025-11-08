'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type AnalyticsTrackerProps = {
  measurementId: string | null;
};

export default function AnalyticsTracker({ measurementId }: AnalyticsTrackerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!measurementId || typeof window === 'undefined' || typeof window.gtag !== 'function') {
      return;
    }
    const pagePath = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname || '/';

    window.gtag('config', measurementId, {
      page_path: pagePath,
    });
  }, [measurementId, pathname, searchParams]);

  return null;
}
