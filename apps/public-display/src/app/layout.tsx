import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'POS Tercos — Pantalla Pública',
  description: 'Display read-only del turno actual + próximos en fila',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
