import { palette, space } from '@/lib/tokens';
import { SeedBadge } from './SeedBadge';
import { FreshnessBadge } from './FreshnessBadge';

interface Props {
  title: string;
  subtitle?: string;
  generatedAt: string;
  isSeed: boolean;
}

// Luckin house-style header: sticky navy gradient bar, uppercase wordmark +
// board title, with the freshness/seed chips on the right. Mirrors the
// luckin-store-ops / luckin-efficiency NA-ops dashboards.
export function BrandHeader({ title, subtitle, generatedAt, isSeed }: Props) {
  return (
    <header
      style={{
        background: `linear-gradient(120deg, ${palette.navyDeep} 0%, ${palette.navy} 38%, ${palette.blue} 100%)`,
        color: '#FFFFFF',
        boxShadow: '0 2px 10px rgba(6,29,74,0.20), 0 1px 2px rgba(6,29,74,0.12)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: space.lg,
          flexWrap: 'wrap',
        }}
      >
        <BrandMark />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.72)',
              whiteSpace: 'nowrap',
            }}
          >
            Luckin Coffee
          </span>
          <span aria-hidden style={{ color: 'rgba(255,255,255,0.32)', fontSize: '12px' }}>·</span>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{title}</span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isSeed && <SeedBadge />}
          <FreshnessBadge generatedAt={generatedAt} tone="dark" />
        </div>
      </div>
      {subtitle && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 28px 12px', color: 'rgba(255,255,255,0.66)', fontSize: '13px' }}>
          {subtitle}
        </div>
      )}
    </header>
  );
}

// A minimal coffee-cup roundel in the brand frame — evokes a logo mark without
// reproducing the Luckin deer artwork.
function BrandMark() {
  return (
    <span
      aria-hidden
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.22)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M17 9h2.5a2.5 2.5 0 0 1 0 5H17" stroke="#FFFFFF" strokeWidth="1.6" />
        <path d="M8 3.4c-.6 1 .6 1.8 0 2.8M12 3.4c-.6 1 .6 1.8 0 2.8" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
