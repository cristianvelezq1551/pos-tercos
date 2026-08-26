import { BookOpen, ClipboardCheck, CookingPot, GraduationCap, Package, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUserServer } from '../../features/auth';

const LAUNCHER = [
  { href: '/biblia', label: 'Biblia de recetas', desc: 'Cómo se prepara cada producto y subproducto', icon: BookOpen },
  { href: '/produccion', label: 'Producción', desc: 'Qué falta producir y registrar tandas', icon: CookingPot },
  { href: '/inventario', label: 'Inventario', desc: 'Ver stock, registrar merma y contar', icon: Package },
  { href: '/incidencias', label: 'Incidencias', desc: 'Avisarle al dueño de un problema', icon: TriangleAlert },
  { href: '/checklist', label: 'Checklist', desc: 'Apertura y cierre de cocina', icon: ClipboardCheck },
  { href: '/guia', label: 'Guía', desc: 'Cómo se hace cada cosa, paso a paso', icon: GraduationCap },
] as const;

export default async function CocinaHome() {
  const user = await getCurrentUserServer();
  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
        Hola{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''} 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">¿Qué vas a hacer?</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAUNCHER.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group flex min-h-[7rem] flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 active:bg-muted/60"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="font-display text-lg font-bold text-foreground">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.desc}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
