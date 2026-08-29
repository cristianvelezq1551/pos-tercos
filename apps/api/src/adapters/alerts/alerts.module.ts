import { Global, Logger, Module } from '@nestjs/common';
import type { AlertChannel } from '@pos-tercos/domain';
import { GitHubIssueAlertAdapter } from './github-issue.adapter';
import { NoopAlertAdapter } from './noop.adapter';

export const ALERT_CHANNEL = Symbol('ALERT_CHANNEL');

const logger = new Logger('AlertsModule');

/**
 * Canal de avisos técnicos. Mismo patrón que WhatsAppModule/StorageModule:
 * factory lazy, todo-o-nada. Una config a medias en prod significaría cero
 * avisos sin que nadie lo note — que es justo el agujero que este módulo
 * viene a tapar.
 */
@Global()
@Module({
  providers: [
    NoopAlertAdapter,
    {
      provide: ALERT_CHANNEL,
      useFactory: (noop: NoopAlertAdapter): AlertChannel => {
        const vars = [process.env.ALERT_GITHUB_REPO, process.env.ALERT_GITHUB_TOKEN];
        const set = vars.filter((v) => v && v.trim().length > 0).length;
        if (set === 1) {
          throw new Error(
            'Config ALERT_GITHUB_* incompleta: se necesitan ALERT_GITHUB_REPO y ALERT_GITHUB_TOKEN (o ninguna).',
          );
        }
        if (set === 2) {
          logger.log('Avisos técnicos por Issue de GitHub (ALERT_GITHUB_* detectadas)');
          return new GitHubIssueAlertAdapter();
        }
        logger.warn('ALERT_GITHUB_* ausentes — los errores del servidor solo quedan en el log');
        return noop;
      },
      inject: [NoopAlertAdapter],
    },
  ],
  exports: [ALERT_CHANNEL],
})
export class AlertsModule {}
