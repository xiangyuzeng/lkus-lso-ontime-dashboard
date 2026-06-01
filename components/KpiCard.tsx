import { palette, radius, shadow } from '@/lib/tokens';

interface Props {
  title: string;
  value: string | number;
  accent?: 'neutral' | 'yellow' | 'orange' | 'red';
  suffix?: string;
  hint?: string;
}

const ACCENT_FG: Record<NonNullable<Props['accent']>, string> = {
  neutral: palette.navy,
  yellow:  palette.gold,
  orange:  palette.orange,
  red:     palette.danger,
};

const ACCENT_RAIL: Record<NonNullable<Props['accent']>, string> = {
  neutral: palette.blue,
  yellow:  palette.gold,
  orange:  palette.orange,
  red:     palette.danger,
};

export function KpiCard({ title, value, accent = 'neutral', suffix, hint }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: radius.lg,
        padding: '18px 18px 16px 22px',
        boxShadow: shadow.sm,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          background: ACCENT_RAIL[accent],
        }}
      />
      <div style={{ color: palette.textMuted, fontSize: '13px', fontWeight: 500 }}>{title}</div>
      <div
        style={{
          marginTop: '6px',
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
          color: ACCENT_FG[accent],
        }}
      >
        <span style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1 }}>{value}</span>
        {suffix && <span style={{ fontSize: '13px', fontWeight: 500 }}>{suffix}</span>}
      </div>
      {hint && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: palette.textMuted }}>{hint}</div>
      )}
    </div>
  );
}
