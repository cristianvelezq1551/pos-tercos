import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-app',
});

const fontDisplay = Big_Shoulders({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700', '800'],
  variable: '--font-display-app',
});

export const metadata: Metadata = {
  title: 'POS Tercos — KDS Cocina',
  description: 'Pantalla de cocina con tap para cambiar estado y cronómetros por orden',
  manifest: '/manifest.json',
  applicationName: 'KDS Tercos',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KDS Tercos',
  },
};

export const viewport: Viewport = {
  themeColor: '#131822',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-CO"
      data-theme="dark"
      className={`${fontSans.variable} ${fontDisplay.variable}`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon-192.svg" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body>
        {children}
        <Script id="sw-register" strategy="afterInteractive">
          {`(function() {
              if (!('serviceWorker' in navigator)) return;
              const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
              if (isLocal) {
                navigator.serviceWorker.getRegistrations().then(regs => {
                  regs.forEach(r => r.unregister());
                });
                if ('caches' in window) {
                  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
                }
                return;
              }
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(console.error);
              });
            })();`}
        </Script>
      </body>
    </html>
  );
}
