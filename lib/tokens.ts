// Design tokens — single source of truth for color, spacing, type, radius, shadow.
// Pattern mirrored from /app/luckin-store-ops-dashboard/lib/tokens.ts; values
// reshaped around the navy/blue/gold/orange/danger heat scale used by §3.

export const palette = {
  navy: '#0A2E6C',
  navyDeep: '#061d4a',
  blue: '#1A4B9C',
  blueSoft: 'rgba(74, 144, 217, 0.16)',

  // Heat scale (text + bg pairs)
  gold: '#B7791F',
  goldBg: '#FEF3C7',
  orange: '#C2410C',
  orangeBg: '#FFEDD5',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',

  bg: '#FFFFFF',
  page: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  text: '#0F172A',
  textMuted: '#64748B',
  textPlaceholder: '#94A3B8',

  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
} as const;

export const space = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
} as const;

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  pill: '999px',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.04)',
  md: '0 2px 8px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
  lg: '0 12px 28px rgba(6, 29, 74, 0.10), 0 4px 8px rgba(15, 23, 42, 0.04)',
} as const;

export const type = {
  family:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  sizeKpiValue: '28px',
  sizeKpiTitle: '13px',
  sizeBody: '14px',
  sizeSmall: '12px',
  sizeHeader: '15px',
  weightRegular: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
} as const;

export type Band = 'none' | 'yellow' | 'orange' | 'red';

export const bandStyle: Record<Band, { fg: string; bg: string; barFill: string }> = {
  none:   { fg: palette.text,    bg: palette.surfaceAlt, barFill: palette.blueSoft },
  yellow: { fg: palette.gold,    bg: palette.goldBg,     barFill: palette.gold     },
  orange: { fg: palette.orange,  bg: palette.orangeBg,   barFill: palette.orange   },
  red:    { fg: palette.danger,  bg: palette.dangerBg,   barFill: palette.danger   },
};

// Unit suffix for the value column / KPIs: hours → "h", days → "d".
export const unitSuffix = (unit: 'hours' | 'days'): string => (unit === 'hours' ? 'h' : 'd');
