import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { ClientErrorReporter } from '../components/ClientErrorReporter';

const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-app',
});

/**
 * Big Shoulders va AUTO-HOSPEDADA, no por `next/font/google`. Google renombró
 * la familia ("Big Shoulders Display" → "Big Shoulders") y la tabla de
 * métricas de Next se quedó sin ella: el build avisaba «Failed to find font
 * override values» (de ahí el `adjustFontFallback: false` que había acá) y de
 * a ratos reventaba con `Cannot read properties of null`, tumbando web y admin
 * a la vez. Con el archivo en el repo el build ya no depende de la red.
 *
 * Es el mismo woff2 variable (subset latin, pesos 600–800) que servía Google.
 */
const fontDisplay = localFont({
  src: './fonts/big-shoulders-latin-var.woff2',
  display: 'swap',
  weight: '600 800',
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
