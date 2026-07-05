import { USER_ROLE_LABELS, type AuditLogEntry } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

/**
 * Traduce el `metadata` crudo (developer JSON) a un resumen humano + lista de
 * datos legibles, por acción. Si una acción no tiene un caso dedicado cae a un
 * listado genérico clave→valor. La UI siempre puede mostrar el JSON técnico
 * por debajo en un colapsable.
 */

const REASON_LABEL: Record<string, string> = {
  wrong_password: 'contraseña incorrecta',
  no_user: 'el usuario no existe',
  user_inactive: 'el usuario está inactivo',
  invalid_pin: 'PIN inválido',
  missing_pin: 'no envió PIN',
};

const ROLE_LABEL: Record<string, string> = USER_ROLE_LABELS;

const PAY_TYPE_LABEL: Record<string, string> = { MONTHLY: 'Mensual', DAILY: 'Diario' };

const KEY_LABEL: Record<string, string> = {
  email: 'Correo',
  reason: 'Motivo',
  approverId: 'Aprobado con PIN',
  workerId: 'Trabajador (id)',
  workDate: 'Día',
  amount: 'Monto',
  concept: 'Concepto',
  periodStart: 'Inicio del pago',
  date: 'Fecha',
  note: 'Nota',
  role: 'Rol',
  payType: 'Tipo de pago',
  salaryAmount: 'Salario',
  withPin: 'Con PIN configurado',
  removed: 'Eliminado',
  source: 'Origen',
  modelUsed: 'Modelo IA',
  rationaleLen: 'Largo de respuesta IA',
  historySize: 'Histórico evaluado',
  fullName: 'Nombre',
  phone: 'Teléfono',
  active: 'Activo',
};

// Claves que no aportan al usuario final (ya están dichas en el resumen).
const HIDDEN_KEYS = new Set(['self', 'stage']);

export interface Fact {
  label: string;
  value: string;
}

export interface AuditDetailDescription {
  summary: string;
  facts: Fact[];
}

function formatDateOnly(s: string): string {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (!m) return s;
  const d = new Date(`${m[0]}T00:00:00.000Z`);
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'reason' && typeof value === 'string') return REASON_LABEL[value] ?? value;
  if (key === 'role' && typeof value === 'string') return ROLE_LABEL[value] ?? value;
  if (key === 'payType' && typeof value === 'string') return PAY_TYPE_LABEL[value] ?? value;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if ((key === 'amount' || key === 'salaryAmount') && typeof value === 'number') {
    return formatCop(value);
  }
  if ((key === 'workDate' || key === 'date' || key === 'periodStart') && typeof value === 'string') {
    return formatDateOnly(value);
  }
  if (key === 'approverId' && typeof value === 'string') return `id ${value.slice(0, 8)}…`;
  if (key === 'workerId' && typeof value === 'string') return `id ${value.slice(0, 8)}…`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function factsFrom(metadata: unknown): Fact[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const m = metadata as Record<string, unknown>;
  const out: Fact[] = [];
  for (const [key, value] of Object.entries(m)) {
    if (HIDDEN_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    // `changes` viene como objeto anidado en USER_UPDATED → aplanamos.
    if (key === 'changes' && typeof value === 'object') {
      for (const [ck, cv] of Object.entries(value as Record<string, unknown>)) {
        if (cv === null || cv === undefined) continue;
        out.push({ label: KEY_LABEL[ck] ?? ck, value: formatValue(ck, cv) });
      }
      continue;
    }
    // `before`/`after` se muestran en el resumen para salario; ignorar aquí.
    if (key === 'before' || key === 'after') continue;
    out.push({ label: KEY_LABEL[key] ?? key, value: formatValue(key, value) });
  }
  return out;
}

function fmtSalarySnapshot(x: unknown): string {
  if (!x || typeof x !== 'object') return 'sin valor';
  const o = x as { payType?: string; salaryAmount?: number };
  const pt = o.payType ? (PAY_TYPE_LABEL[o.payType] ?? o.payType).toLowerCase() : 'sin tipo';
  const amt = typeof o.salaryAmount === 'number' ? formatCop(o.salaryAmount) : 'sin monto';
  return `${amt} (${pt})`;
}

export function describeAuditDetail(entry: AuditLogEntry): AuditDetailDescription {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    // --- Sesiones ---
    case 'AUTH_LOGIN_FAILED': {
      const email = typeof m.email === 'string' ? m.email : 'desconocido';
      const reason =
        typeof m.reason === 'string' ? REASON_LABEL[m.reason] ?? m.reason : 'motivo desconocido';
      return {
        summary: `Alguien intentó iniciar sesión como ${email}. El intento falló porque ${reason}.`,
        facts: factsFrom(m),
      };
    }
    case 'AUTH_LOGIN':
      return { summary: 'Inició sesión correctamente.', facts: factsFrom(m) };
    case 'AUTH_LOGOUT':
      return { summary: 'Cerró su sesión.', facts: factsFrom(m) };
    case 'AUTH_PASSWORD_CHANGED':
      return { summary: 'Cambió su propia contraseña.', facts: factsFrom(m) };

    // --- Usuarios ---
    case 'USER_CREATED': {
      const email = String(m.email ?? '');
      const role = ROLE_LABEL[String(m.role ?? '')] ?? String(m.role ?? '');
      const withPin = m.withPin ? ' con PIN configurado' : '';
      return { summary: `Creó al usuario ${email} con rol ${role}${withPin}.`, facts: factsFrom(m) };
    }
    case 'USER_UPDATED':
      return { summary: 'Editó datos del usuario.', facts: factsFrom(m) };
    case 'USER_DEACTIVATED':
      return { summary: 'Desactivó al usuario (no puede iniciar sesión).', facts: factsFrom(m) };
    case 'USER_REACTIVATED':
      return { summary: 'Reactivó al usuario.', facts: factsFrom(m) };
    case 'USER_DELETED': {
      const email = String(m.email ?? '');
      const role = ROLE_LABEL[String(m.role ?? '')] ?? '';
      return {
        summary: `Eliminó definitivamente al usuario ${email}${role ? ` (${role})` : ''}.`,
        facts: factsFrom(m),
      };
    }
    case 'USER_PASSWORD_RESET':
      return {
        summary: `Reseteó la contraseña del usuario${m.email ? ` (${String(m.email)})` : ''}. Tendrá que cambiarla en el siguiente ingreso.`,
        facts: factsFrom(m),
      };
    case 'USER_PIN_SET':
      return { summary: 'Configuró el PIN de aprobación de un usuario.', facts: factsFrom(m) };

    // --- Nómina ---
    case 'USER_SALARY_CHANGED':
      return {
        summary: `Cambió el salario: de ${fmtSalarySnapshot(m.before)} a ${fmtSalarySnapshot(m.after)}.`,
        facts: factsFrom(m),
      };
    case 'EMPLOYMENT_TERMINATED': {
      const email = String(m.email ?? 'usuario');
      const date = typeof m.date === 'string' ? formatDateOnly(m.date) : '—';
      return {
        summary: `Terminó el empleo de ${email} con fecha de salida ${date}. El usuario quedó inactivo.`,
        facts: factsFrom(m),
      };
    }
    case 'PAYROLL_DAY_SET': {
      const day = typeof m.workDate === 'string' ? formatDateOnly(m.workDate) : '—';
      if (m.removed) {
        return {
          summary: `Restableció el día ${day} al valor por defecto (quitó la excepción).`,
          facts: factsFrom(m),
        };
      }
      const amt = typeof m.amount === 'number' ? formatCop(m.amount) : '?';
      const kind = m.amount === 0 ? 'lo marcó como No asistió' : `lo dejó en ${amt}`;
      return { summary: `Registró excepción en el día ${day}: ${kind}.`, facts: factsFrom(m) };
    }
    case 'PAYROLL_ADJUSTMENT_ADDED': {
      if (m.removed) return { summary: 'Quitó una novedad del pago.', facts: factsFrom(m) };
      const concept = String(m.concept ?? 'Novedad');
      const amt = typeof m.amount === 'number' ? formatCop(m.amount) : '?';
      return { summary: `Agregó novedad "${concept}" por ${amt}.`, facts: factsFrom(m) };
    }

    // --- Aprobaciones ---
    case 'APPROVAL_GRANTED':
      return { summary: 'Aprobó una acción sensible con su PIN.', facts: factsFrom(m) };
    case 'APPROVAL_DENIED':
      return {
        summary: 'Se rechazó un intento de aprobación (PIN incorrecto o no enviado).',
        facts: factsFrom(m),
      };
    case 'APPROVAL_PIN_SET':
      return {
        summary: m.self
          ? 'Cambió su propio PIN de aprobación.'
          : 'Configuró el PIN de aprobación de un usuario.',
        facts: factsFrom(m),
      };

    // --- Fallback ---
    default:
      return { summary: '', facts: factsFrom(m) };
  }
}
