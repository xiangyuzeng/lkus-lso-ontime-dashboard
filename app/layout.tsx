import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LSO On-Time Completion · Luckin Coffee North America',
  description:
    'On-time LSO100 / LSO200 certification completion rates by region and overall (tenant LKUS).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
