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
  title: 'POS Tercos — POS Cajero',
  description: 'Venta en mostrador con offline + impresora ESC/POS + cajón monedero',
  manifest: '/manifest.json',
  applicationName: 'POS Tercos',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'POS Tercos',
  },
};

export const viewport: Viewport = {
  themeColor: '#B81F2A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-CO" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <head>
        {/* El favicon lo genera Next desde src/app/icon.png (logoTercos). */}
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </head>
      <body>
        {children}
        {process.env.NODE_ENV === 'production' ? (
          <Script id="sw-register" strategy="afterInteractive">
            {`(function() {
                if (!('serviceWorker' in navigator)) return;
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(console.error);
                });
              })();`}
          </Script>
        ) : (
          <Script id="sw-unregister" strategy="afterInteractive">
            {`(function() {
                // En dev NUNCA registramos SW (sin importar el hostname: localhost
                // o IP de red para la tablet). HMR + caché del SW pelean y dejan
                // bundles viejos sirviendo. Además limpiamos cualquier SW/caché
                // que haya quedado de un build previo.
                if (!('serviceWorker' in navigator)) return;
                navigator.serviceWorker.getRegistrations().then(regs => {
                  regs.forEach(r => r.unregister());
                });
                if ('caches' in window) {
                  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
                }
              })();`}
          </Script>
        )}
      </body>
    </html>
  );
}
