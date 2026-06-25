'use client';

import type { WeeklyPayrollEntry } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { Pencil, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EditSalaryDialog, TerminateDialog } from '../../users';

type Modal = 'salary' | 'terminate' | null;

/** Acciones de empleo del trabajador desde la nómina: editar salario / tipo /
 *  días de descanso, y terminar el contrato. Reusa los diálogos de Usuarios. */
export function EmployeeActions({ entry }: { entry: WeeklyPayrollEntry }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const close = (): void => setModal(null);
  const done = (): void => {
    setModal(null);
    router.refresh();
  };
  const terminated = entry.terminationDate !== null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setModal('salary')}>
        <Pencil className="h-3.5 w-3.5" /> Salario
      </Button>
      {!terminated ? (
        <Button variant="outline" size="sm" onClick={() => setModal('terminate')}>
          <UserX className="h-3.5 w-3.5" /> Terminar
        </Button>
      ) : null}

      {modal === 'salary' ? (
        <EditSalaryDialog
          user={{
            id: entry.userId,
            fullName: entry.fullName,
            payType: entry.payType,
            salaryAmount: entry.salaryAmount,
            hireDate: entry.hireDate,
            restDaysOfWeek: entry.restDaysOfWeek,
          }}
          onClose={close}
          onSuccess={done}
        />
      ) : null}
      {modal === 'terminate' ? (
        <TerminateDialog user={{ id: entry.userId, fullName: entry.fullName }} onClose={close} onSuccess={done} />
      ) : null}
    </div>
  );
}
