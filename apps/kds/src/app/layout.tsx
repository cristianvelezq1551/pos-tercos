import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'POS Tercos — KDS Cocina',
  description: 'Pantalla de cocina con tap para cambiar estado y cronómetros por orden',
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
