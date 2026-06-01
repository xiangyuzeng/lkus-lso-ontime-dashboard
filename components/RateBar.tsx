import { palette, radius } from '@/lib/tokens';

interface Props {
  label: string;
  numerator: number;
  denominator: number;
  rate: number;            // 0..1
  prominent?: boolean;     // overall row → bigger/darker
  pending?: boolean;       // region not yet mapped
  storeCount?: number;
}

// A horizontal completion-rate bar with the underlying raw counts always shown
// (numerator / denominator), never just the percentage.
export function RateBar({ label, numerator, denominator, rate, prominent, pending, storeCount }: Props) {
  const pct = denominator > 0 ? Math.max(0, Math.min(100, rate * 100)) : 0;
  const pctLabel = denominator > 0 ? `${(rate * 100).toFixed(1)}%` : '—';
  const fill = prominent ? palette.navy : palette.blue;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: prominent ? 700 : 600,
            fontSize: prominent ? '15px' : '14px',
            color: palette.text,
          }}
        >
          {label}
          {pending && <PendingTag />}
          {typeof storeCount === 'number' && storeCount > 0 && (
            <span style={{ color: palette.textPlaceholder, fontWeight: 500, fontSize: '12px' }}>
              · {storeCount} store{storeCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <strong style={{ fontSize: prominent ? '20px' : '16px', color: prominent ? palette.navy : palette.text }}>
            {pctLabel}
          </strong>
          <span style={{ color: palette.textMuted, fontSize: '13px', marginLeft: '8px' }}>
            {numerator} / {denominator}
          </span>
        </span>
      </div>
      <div
        aria-hidden
        style={{
          position: 'relative',
          height: prominent ? '14px' : '10px',
          background: palette.surfaceAlt,
          border: `1px solid ${palette.border}`,
          borderRadius: radius.pill,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: fill,
            borderRadius: radius.pill,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

function PendingTag() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 8px',
        background: palette.goldBg,
        color: palette.gold,
        border: `1px solid ${palette.gold}`,
        borderRadius: radius.pill,
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      ungrouped
    </span>
  );
}
