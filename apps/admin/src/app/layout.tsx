import type { Metadata } from 'next';
import { Big_Shoulders, Inter } from 'next/font/google';
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
