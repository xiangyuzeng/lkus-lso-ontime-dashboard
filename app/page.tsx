'use client';

import { BrandHeader } from '@/components/BrandHeader';
import { MetricCard } from '@/components/MetricCard';
import { Methodology } from '@/components/Methodology';
import { freshness } from '@/lib/freshness';
import { palette, radius, space } from '@/lib/tokens';
import { usePayload } from '@/lib/payload';
import type { PayloadMeta, StoreRow } from '@/lib/types';

export default function Page() {
  const { status, payload, error } = usePayload();

  if (status === 'loading' || !payload) {
    return (
      <StateScreen>
        <span style={{ color: palette.textMuted }}>Loading…</span>
      </StateScreen>
    );
  }
  if (status === 'error') {
    return (
      <StateScreen>
        <span style={{ color: palette.danger }}>Failed to load data: {error ?? 'unknown error'}</span>
      </StateScreen>
    );
  }

  const stale = freshness(payload.meta.generated_at).isStale;
  const isSeed = payload.meta.source === 'seed';

  return (
    <main style={{ minHeight: '100vh', background: palette.page }}>
      <BrandHeader
        title="LSO On-Time Completion"
        subtitle={`North America · tenant LKUS · reporting timezone ${payload.meta.tz}`}
        generatedAt={payload.meta.generated_at}
        isSeed={isSeed}
      />

      <div className={stale ? 'board--stale' : undefined}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: `${space.xl} ${space.xl} ${space['3xl']}`,
            display: 'flex',
            flexDirection: 'column',
            gap: space.xl,
          }}
        >
          {payload.meta.region_map_status === 'pending' && <RegionPendingBanner storeCount={payload.stores.length} />}

          <section style={{ display: 'grid', gap: space.xl, gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
            {payload.metrics.map((m) => (
              <MetricCard key={m.level} metric={m} />
            ))}
          </section>

          <Methodology payload={payload} />

          <StoresReference stores={payload.stores} />

          <SourceLine meta={payload.meta} />
        </div>
      </div>
    </main>
  );
}

function StateScreen({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: palette.page }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: space['3xl'] }}>{children}</div>
    </main>
  );
}

function RegionPendingBanner({ storeCount }: { storeCount: number }) {
  return (
    <div
      role="note"
      style={{
        padding: `${space.md} ${space.lg}`,
        background: palette.goldBg,
        border: `1px solid ${palette.gold}`,
        borderRadius: radius.md,
        color: palette.gold,
        fontSize: '13px',
        lineHeight: 1.6,
      }}
    >
      <strong>Region rollup pending.</strong> No store→region map is published yet, so all {storeCount} stores
      are reported as one <em>ungrouped</em> bucket (equal to Overall). Fill{' '}
      <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>pipeline/config/region_map.csv</code>{' '}
      and the next refresh breaks these out by region — nothing is fabricated until then.
    </div>
  );
}

function StoresReference({ stores }: { stores: StoreRow[] }) {
  if (!stores.length) return null;
  return (
    <section>
      <h3 style={{ margin: `0 0 ${space.md}`, fontSize: '14px', color: palette.text }}>
        Stores &amp; current region mapping{' '}
        <span style={{ color: palette.textPlaceholder, fontWeight: 400 }}>· edit region_map.csv to group these</span>
      </h3>
      <div style={{ overflowX: 'auto', border: `1px solid ${palette.border}`, borderRadius: radius.md, background: palette.surface }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: palette.surfaceAlt, textAlign: 'left', color: palette.textMuted }}>
              <Th>Store</Th>
              <Th>Region</Th>
              <Th align="right">LSO100 entered</Th>
              <Th align="right">LSO200 entered</Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const pending = !s.region || s.region.toLowerCase() === 'pending';
              return (
                <tr key={s.store} style={{ borderTop: `1px solid ${palette.border}` }}>
                  <Td>{s.store}</Td>
                  <Td>{pending ? <span style={{ color: palette.gold, fontWeight: 600 }}>pending</span> : s.region}</Td>
                  <Td align="right">{s.lso100_denominator}</Td>
                  <Td align="right">{s.lso200_denominator}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: align ?? 'left' }}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <td style={{ padding: '9px 14px', textAlign: align ?? 'left', fontVariantNumeric: 'tabular-nums' }}>{children}</td>;
}

function SourceLine({ meta }: { meta: PayloadMeta }) {
  const notes = Object.entries(meta.data_notes ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');
  return (
    <p style={{ margin: 0, color: palette.textPlaceholder, fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
      roster: {meta.sources.roster} · cert: {meta.sources.cert} · hours: {meta.sources.hours} · region_map:{' '}
      {meta.region_map_status} · generated_by: {meta.generated_by}
      {notes ? ` · ${notes}` : ''}
    </p>
  );
}
