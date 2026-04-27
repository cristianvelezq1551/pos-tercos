import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@pos-tercos/types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const OnlyDueno = () => Roles('DUENO');
export const AdminAccess = () => Roles('ADMIN_OPERATIVO', 'DUENO');
export const CashierAccess = () => Roles('CAJERO', 'ADMIN_OPERATIVO', 'DUENO');
export const InternalAccess = () =>
  Roles('CAJERO', 'COCINERO', 'REPARTIDOR', 'ADMIN_OPERATIVO', 'DUENO', 'TRABAJADOR');
