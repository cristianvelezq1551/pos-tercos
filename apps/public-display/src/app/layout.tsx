import type { Metadata, Viewport } from 'next';
import { Anton, Barlow_Semi_Condensed } from 'next/font/google';
import './globals.css';

// Tipografía de marca TERCOS-WEB: Barlow (cuerpo) + Anton (display condensado).
const fontSans = Barlow_Semi_Condensed({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
  variable: '--font-sans-app',
});

const fontDisplay = Anton({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400'],
  variable: '--font-display-app',
});

export const metadata: Metadata = {
  title: 'POS Tercos — Pantalla Pública',
  description: 'Display read-only del turno actual + próximos en fila',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body>{children}</body>
    </html>
  );
}
