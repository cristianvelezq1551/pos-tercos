import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Inter } from 'next/font/google';
import './globals.css';
import { ClientErrorReporter } from '../components/ClientErrorReporter';

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
  adjustFontFallback: false,
});

const BUSINESS_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'TERCOS';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const DESCRIPTION = `Pedir online en ${BUSINESS_NAME} y recoger en tienda. Smash burgers, burros y mac & papas.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BUSINESS_NAME} — Pedir online`,
    template: `%s · ${BUSINESS_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: BUSINESS_NAME,
  keywords: ['hamburguesas', 'smash burger', 'pedidos online', 'comida rápida', BUSINESS_NAME],
  openGraph: {
    type: 'website',
    siteName: BUSINESS_NAME,
    title: `${BUSINESS_NAME} — Pedir online`,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'es_CO',
    images: [{ url: '/brand/wordmark-tercos-dark.png', width: 1200, height: 630, alt: BUSINESS_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BUSINESS_NAME} — Pedir online`,
    description: DESCRIPTION,
    images: ['/brand/wordmark-tercos-dark.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#141414',
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
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
