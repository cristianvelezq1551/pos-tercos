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
 * métricas de Next se quedó sin ella: el build avisa «Failed to find font
 * override values» y de a ratos revienta con `Cannot read properties of null`.
 * Con el archivo en el repo el build ya no depende de la red.
 *
 * Es el mismo woff2 variable (subset latin, pesos 600–800) que servía Google.
 */
const fontDisplay = localFont({
  src: './fonts/big-shoulders-latin-var.woff2',
  display: 'swap',
  weight: '600 800',
  variable: '--font-display-app',
});

export const metadata: Metadata = {
  title: 'Cocina Tercos',
  description: 'App del cocinero: recetas, producción e inventario de cocina',
  applicationName: 'Cocina Tercos',
};

export const viewport: Viewport = {
  themeColor: '#B81F2A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
