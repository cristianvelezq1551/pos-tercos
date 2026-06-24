import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  UpdateBusinessConfigSchema,
  type BusinessConfig,
  type JwtAccessPayload,
  type UpdateBusinessConfig,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BusinessConfigService } from './business-config.service';

@Controller('business-config')
export class BusinessConfigController {
  constructor(private readonly config: BusinessConfigService) {}

  @Get()
  @AdminAccess()
  get(): Promise<BusinessConfig> {
    return this.config.get();
  }

  @Patch()
  @OnlyDueno()
  update(
    @Body(new ZodValidationPipe(UpdateBusinessConfigSchema)) body: UpdateBusinessConfig,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<BusinessConfig> {
    return this.config.update(body, actor.sub);
  }
}
