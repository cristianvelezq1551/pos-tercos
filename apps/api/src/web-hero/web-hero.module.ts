import { Module } from '@nestjs/common';
import { WebHeroController } from './web-hero.controller';
import { WebHeroService } from './web-hero.service';

/**
 * Publicidad configurable del storefront web (encima del menú). El dueño
 * administra imágenes y a dónde llevan; la web las consume por `GET
 * /web-hero/config`. Hermano de `DisplayModule` (turnero TV), pero independiente.
 */
@Module({
  controllers: [WebHeroController],
  providers: [WebHeroService],
  exports: [WebHeroService],
})
export class WebHeroModule {}
