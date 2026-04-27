import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'POS Tercos — Web Pública',
  description: 'Pedidos online — recoger en tienda o domicilio',
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
