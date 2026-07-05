import { Module } from '@nestjs/common';
import { DisplayContentController } from './display-content.controller';
import { DisplayContentService } from './display-content.service';

/**
 * Contenido configurable de la pantalla del local (B-roll + música): el dueño
 * administra QUÉ se muestra en la TV (productos + publicidad), sin turnos.
 */
@Module({
  controllers: [DisplayContentController],
  providers: [DisplayContentService],
  exports: [DisplayContentService],
})
export class DisplayModule {}
