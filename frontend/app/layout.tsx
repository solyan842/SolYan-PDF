import type { Metadata, Viewport } from 'next';
import PwaRegister from '../components/pwa-register';
import './globals.css';
import './advanced.css';

export const metadata: Metadata = {
  title: 'SolYan PDF',
  description: 'Privacy-first PDF tools for the web',
  applicationName: 'SolYan PDF',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#246bfe',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
