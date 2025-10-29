'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ClosePageLinkProps = {
  label?: string;
  fallbackHref?: string;
  className?: string;
};

export default function ClosePageLink({
  label = 'Close',
  fallbackHref = '/',
  className,
}: ClosePageLinkProps) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const handleClick = () => {
    if (canGoBack) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={['link-button', className].filter(Boolean).join(' ')}
      aria-label={label}
    >
      {label}
    </button>
  );
}

