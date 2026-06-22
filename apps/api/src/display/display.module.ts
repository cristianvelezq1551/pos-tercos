import { Module } from '@nestjs/common';
import { DisplayContentController } from './display-content.controller';
import { DisplayContentService } from './display-content.service';

/**
 * Contenido configurable del turnero (B-roll + música). Separado de
 * `PublicDisplayModule` (estado de turnos/SSE) — este módulo administra
 * QUÉ se muestra; aquél, A QUIÉN se llama.
 */
@Module({
  controllers: [DisplayContentController],
  providers: [DisplayContentService],
  exports: [DisplayContentService],
})
export class DisplayModule {}
