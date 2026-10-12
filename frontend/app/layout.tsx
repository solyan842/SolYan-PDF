import type { Metadata } from 'next';
import './globals.css';
import './advanced.css';

export const metadata: Metadata = {
  title: 'SolYan PDF',
  description: 'Privacy-first PDF tools for the web',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
