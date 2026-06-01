'use client';

import { useEffect, useState } from 'react';
import { freshness, formatAge } from '@/lib/freshness';
import { palette, radius } from '@/lib/tokens';

interface Props {
  generatedAt: string;
  staleMin?: number;
  tone?: 'light' | 'dark';
}

export function FreshnessBadge({ generatedAt, staleMin, tone = 'light' }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const f = freshness(generatedAt, staleMin);
  const dark = tone === 'dark';
  const dotColor = f.isStale ? palette.gold : '#34D399';
  const generatedDate = new Date(generatedAt);
  const generatedDisplay = `${generatedDate.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

  const bg = dark
    ? (f.isStale ? 'rgba(183,121,31,0.28)' : 'rgba(255,255,255,0.12)')
    : (f.isStale ? palette.goldBg : palette.surfaceAlt);
  const borderStr = dark
    ? (f.isStale ? 'rgba(254,243,199,0.55)' : 'rgba(255,255,255,0.22)')
    : (f.isStale ? palette.gold : palette.border);
  const textColor = dark
    ? (f.isStale ? '#FDE68A' : 'rgba(255,255,255,0.88)')
    : (f.isStale ? palette.gold : palette.textMuted);

  return (
    <div
      role="status"
      aria-live="polite"
      title={`Data generated ${generatedDisplay}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        background: bg,
        border: `1px solid ${borderStr}`,
        borderRadius: radius.pill,
        fontSize: '13px',
        color: textColor,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: dotColor,
          boxShadow: f.isStale ? 'none' : `0 0 0 3px ${dark ? 'rgba(52,211,153,0.25)' : palette.blueSoft}`,
        }}
      />
      <span style={{ fontWeight: 500 }}>Updated {formatAge(f.ageMinutes)}</span>
      {f.isStale && <span style={{ fontSize: '12px', opacity: 0.9 }}>· stale</span>}
    </div>
  );
}
