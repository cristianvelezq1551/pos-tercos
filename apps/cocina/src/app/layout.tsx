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
