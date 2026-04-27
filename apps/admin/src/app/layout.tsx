import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
