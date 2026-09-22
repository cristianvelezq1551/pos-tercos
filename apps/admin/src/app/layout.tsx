import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-app',
});

/**
 * Big Shoulders va AUTO-HOSPEDADA, no por `next/font/google`.
 *
 * Google renombró la familia ("Big Shoulders Display" → "Big Shoulders") y la
 * tabla de métricas de Next se quedó sin ella: el build avisaba «Failed to find
 * font override values» y de a ratos reventaba con `Cannot read properties of
 * null` tumbando admin y web a la vez (cocina y pantalla, que no la usan,
 * seguían pasando). Con el archivo en el repo no hay descarga ni búsqueda de
 * métricas en cada build, así que el despliegue deja de depender de la red.
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
  title: 'POS Tercos — Admin',
  description: 'Gestión de productos, recetas, inventario, proveedores, reportes, anti-fraude y RRHH',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-CO" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
