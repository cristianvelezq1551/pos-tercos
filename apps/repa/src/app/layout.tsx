import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'POS Tercos — App Repartidor',
  description: 'Lista de pedidos asignados con mapa Mapbox, sort Haversine, cambio de estados',
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
