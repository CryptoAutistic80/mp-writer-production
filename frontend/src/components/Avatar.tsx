"use client";

import { useEffect, useState } from 'react';

type AvatarProps = {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
};

export default function Avatar({ src, alt = '', size = 28, className = '' }: AvatarProps) {
  // Show fallback by default during SSR and until the image is proven loadable.
  const [canShow, setCanShow] = useState(false);

  useEffect(() => {
    if (!src) {
      setCanShow(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setCanShow(true); };
    img.onerror = () => { if (!cancelled) setCanShow(false); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  if (!canShow) {
    const initial = (alt || '').trim().charAt(0).toUpperCase() || '?';
    const fontSize = Math.max(10, Math.floor(size * 0.55));
    return (
      <div
        className={`profile-avatar fallback ${className}`.trim()}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f1f5f9',
          color: '#0f172a',
          fontWeight: 700,
          fontSize,
          textTransform: 'uppercase',
        }}
        aria-label={initial}
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`profile-avatar ${className}`.trim()}
      src={src!}
      alt={alt}
      width={size}
      height={size}
    />
  );
}
