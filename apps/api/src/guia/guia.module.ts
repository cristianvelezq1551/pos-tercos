import { Module } from '@nestjs/common';
import { GuiaController } from './guia.controller';
import { GuiaService } from './guia.service';

/** Asistente de la guía. El módulo de LLM es @Global, no hay que importarlo. */
@Module({
  controllers: [GuiaController],
  providers: [GuiaService],
})
export class GuiaModule {}
