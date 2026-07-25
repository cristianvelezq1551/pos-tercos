import Link from 'next/link';
import { ArrowRight, LayoutDashboard, Wallet } from 'lucide-react';
import { BrandLogo } from '@pos-tercos/brand';
import { LogoutButton } from '../../features/auth';
import { requireOperativoServer } from '../../features/auth/server';

export const dynamic = 'force-dynamic';

/**
 * Launcher del ADMIN_OPERATIVO (unificación POS+admin, Fase 4): elige entre
 * Caja (venta) y Gestión (dashboard). Pantalla completa, sin AdminShell. El
 * DUEÑO no llega acá — requireOperativoServer lo redirige a su Inicio.
 */
export default async function LauncherPage() {
  const user = await requireOperativoServer();
  const firstName = user.fullName?.trim().split(/\s+/)[0] ?? '';

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-12 text-foreground">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LogoutButton />
      </div>

      <header className="flex flex-col items-center gap-4 text-center">
        <BrandLogo variant="wordmark" theme="dark" size="h-8" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {firstName ? `Hola, ${firstName}` : 'Bienvenido'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">¿Qué quieres hacer?</p>
        </div>
      </header>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <LauncherCard
          href="/caja"
          icon={<Wallet className="h-7 w-7" strokeWidth={1.75} aria-hidden />}
          title="Caja"
          description="Vender, cobrar, pedidos web, arqueos y cierre de turno."
          accent
        />
        <LauncherCard
          href="/invoices"
          icon={<LayoutDashboard className="h-7 w-7" strokeWidth={1.75} aria-hidden />}
          title="Gestión"
          description="Compras, facturas, inventario, proveedores y sugerencias."
        />
      </div>
    </main>
  );
}

function LauncherCard({
  href,
  icon,
  title,
  description,
  accent = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-4 rounded-2xl border p-6 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        accent
          ? 'border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10'
          : 'border-border bg-card hover:border-foreground/30 hover:bg-muted/40'
      }`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-xl border ${
          accent
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-muted/40 text-foreground'
        }`}
      >
        {icon}
      </span>
      <div className="flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <span
        className={`inline-flex items-center gap-1 text-sm font-medium ${
          accent ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
        }`}
      >
        Entrar
        <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
      </span>
    </Link>
  );
}
