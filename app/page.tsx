'use client';

import { FreshnessBadge } from '@/components/FreshnessBadge';
import { SeedBadge } from '@/components/SeedBadge';
import { MetricCard } from '@/components/MetricCard';
import { freshness } from '@/lib/freshness';
import { palette, radius, space } from '@/lib/tokens';
import { usePayload } from '@/lib/payload';
import type { Payload, PayloadMeta, StoreRow } from '@/lib/types';

export default function Page() {
  const { status, payload, error } = usePayload();

  if (status === 'loading' || !payload) {
    return (
      <main style={mainStyle}>
        <Shell>
          <div style={{ padding: space['2xl'], color: palette.textMuted }}>Loading…</div>
        </Shell>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main style={mainStyle}>
        <Shell>
          <div style={{ padding: space['2xl'], color: palette.danger }}>
            Failed to load data: {error ?? 'unknown error'}
          </div>
        </Shell>
      </main>
    );
  }

  const stale = freshness(payload.meta.generated_at).isStale;
  const isSeed = payload.meta.source === 'seed';

  return (
    <main style={mainStyle}>
      <div className={stale ? 'board--stale' : undefined}>
        <Shell>
          <Header generatedAt={payload.meta.generated_at} isSeed={isSeed} tz={payload.meta.tz} />

          {payload.meta.region_map_status === 'pending' && <RegionPendingBanner storeCount={payload.stores.length} />}

          <section style={{ display: 'grid', gap: space.xl, gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', marginTop: space.xl }}>
            {payload.metrics.map((m) => (
              <MetricCard key={m.level} metric={m} />
            ))}
          </section>

          <StoresReference stores={payload.stores} />

          <Footnote />
          <SourceLine meta={payload.meta} />
        </Shell>
      </div>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: palette.page,
  paddingBottom: space['3xl'],
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: `${space['2xl']} ${space.xl}` }}>{children}</div>
  );
}

function Header({ generatedAt, isSeed, tz }: { generatedAt: string; isSeed: boolean; tz: string }) {
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: palette.navy, letterSpacing: '-0.01em' }}>
          LSO On-Time Completion
        </h1>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', color: palette.textMuted, fontSize: '13px' }}>
          <span>Luckin Coffee · North America · LKUS · reporting TZ {tz}</span>
          {isSeed && <SeedBadge />}
        </div>
      </div>
      <FreshnessBadge generatedAt={generatedAt} />
    </header>
  );
}

function RegionPendingBanner({ storeCount }: { storeCount: number }) {
  return (
    <div
      role="note"
      style={{
        marginTop: space.lg,
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
    <section style={{ marginTop: space['2xl'] }}>
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
                  <Td>
                    {pending ? (
                      <span style={{ color: palette.gold, fontWeight: 600 }}>pending</span>
                    ) : (
                      s.region
                    )}
                  </Td>
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

function Footnote() {
  return (
    <p style={{ marginTop: space.xl, color: palette.textMuted, fontSize: '12px', lineHeight: 1.7 }}>
      <strong>Rate</strong> = (earned the cert on time) ÷ (entered that level&apos;s training).{' '}
      <strong>LSO100 on-time</strong> = cumulative clocked effective-hours from hire to acquisition ≤ 112.{' '}
      <strong>LSO200 on-time</strong> = calendar days from hire to acquisition ≤ 45.{' '}
      <strong>Denominator</strong> — LSO100: everyone assigned to a store (active + separated) plus LSO100 completers;
      LSO200: the LSO100-completer pool plus LSO200 completers. <strong>In progress</strong> = entered − completed
      (no in-progress training is recorded upstream for LKUS, so it is the roster minus completers).
      Completers earned before their hire date or with no hire date are excluded from on-time and shown as
      <em> Excluded</em>.
    </p>
  );
}

function SourceLine({ meta }: { meta: PayloadMeta }) {
  const notes = Object.entries(meta.data_notes ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');
  return (
    <p style={{ marginTop: space.sm, color: palette.textPlaceholder, fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
      roster: {meta.sources.roster} · cert: {meta.sources.cert} · hours: {meta.sources.hours} · region_map:{' '}
      {meta.region_map_status} · generated_by: {meta.generated_by}
      {notes ? ` · ${notes}` : ''}
    </p>
  );
}
