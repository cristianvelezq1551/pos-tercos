import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateUserSchema,
  ResetPasswordSchema,
  SetEmploymentSchema,
  SetUserPinSchema,
  TerminateEmploymentSchema,
  UpdateUserSchema,
  type CreateUser,
  type JwtAccessPayload,
  type ManagedUser,
  type ResetPassword,
  type SetEmployment,
  type SetUserPin,
  type TerminateEmployment,
  type UpdateUser,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

/**
 * Gestión de usuarios/empleados. Dueño-only: crear o cambiar el rol de un
 * usuario puede otorgar acceso administrativo, así que es la acción más
 * sensible del sistema. Un Admin Operativo no gestiona personal en v1.
 */
@OnlyDueno()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<ManagedUser[]> {
    return this.users.listManaged();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUser,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<ManagedUser> {
    return this.users.create(body, actor.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUser,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<ManagedUser> {
    return this.users.update(id, body, actor.sub);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPassword,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<void> {
    await this.users.resetPassword(id, body.newPassword, actor.sub);
  }

  @Post(':id/pin')
  @HttpCode(204)
  async setPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetUserPinSchema)) body: SetUserPin,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<void> {
    await this.users.setPin(id, body.pin, body.password, actor.sub);
  }

  /** Cambiar el salario / tipo de pago. Requiere PIN (header X-Approval-Pin). */
  @Post(':id/employment')
  setEmployment(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @Body(new ZodValidationPipe(SetEmploymentSchema)) body: SetEmployment,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<ManagedUser> {
    if (!pin) {
      throw new BadRequestException('Se requiere el PIN de aprobación (header X-Approval-Pin).');
    }
    return this.users.setEmployment(id, body, pin, actor.sub);
  }

  /** Terminar el empleo (inactiva el usuario y liquida hasta la fecha). Requiere PIN. */
  @Post(':id/terminate')
  terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @Body(new ZodValidationPipe(TerminateEmploymentSchema)) body: TerminateEmployment,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<ManagedUser> {
    if (!pin) {
      throw new BadRequestException('Se requiere el PIN de aprobación (header X-Approval-Pin).');
    }
    return this.users.terminate(id, body, pin, actor.sub);
  }

  /** Eliminar definitivamente (solo si no tiene historial). Requiere PIN. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-approval-pin') pin: string | undefined,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<void> {
    if (!pin) {
      throw new BadRequestException('Se requiere el PIN de aprobación (header X-Approval-Pin).');
    }
    await this.users.deleteUser(id, pin, actor.sub);
  }
}
