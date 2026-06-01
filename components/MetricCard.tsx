import type { Metric } from '@/lib/types';
import { palette, radius, shadow, space } from '@/lib/tokens';
import { RateBar } from './RateBar';

function defChip(m: Metric): string {
  const unit = m.definition.unit === 'hours' ? 'effective-hours' : 'days';
  return `On time = cert earned ≤ ${m.definition.budget} ${unit} since hire`;
}

export function MetricCard({ metric }: { metric: Metric }) {
  const o = metric.overall;
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.md,
        padding: space.xl,
        paddingLeft: '26px',
      }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: palette.navy }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm, alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: palette.navy }}>
          <span style={{ fontWeight: 800 }}>{metric.level}</span>{' '}
          <span style={{ fontWeight: 600 }}>on-time completion</span>
        </h2>
        <span
          style={{
            padding: '4px 10px',
            background: palette.blueSoft,
            color: palette.blue,
            borderRadius: radius.pill,
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {defChip(metric)}
        </span>
      </div>

      <div style={{ marginTop: space.lg }}>
        <RateBar label="Overall" numerator={o.numerator} denominator={o.denominator} rate={o.rate} prominent />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.lg, marginTop: space.md }}>
          <Stat label="Entered (denominator)" value={o.denominator} hint={metric.denominator_def} />
          <Stat label="Completed (any time)" value={o.completed} />
          <Stat label="In progress" value={o.in_progress} />
          <Stat label="On time (numerator)" value={o.numerator} accent />
          {!!o.anomalies && <Stat label="Excluded (pre-hire / undated)" value={o.anomalies} />}
        </div>
      </div>

      <div style={{ marginTop: space.xl }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: palette.text, marginBottom: space.md }}>By region</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
          {metric.by_region.map((c) => (
            <RateBar
              key={c.region}
              label={c.region}
              numerator={c.numerator}
              denominator={c.denominator}
              rate={c.rate}
              pending={c.pending}
              storeCount={c.store_count}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div title={hint} style={{ minWidth: '120px' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent ? palette.navy : palette.text, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: palette.textMuted, marginTop: '2px' }}>{label}</div>
    </div>
  );
}
