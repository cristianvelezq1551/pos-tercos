import { Global, Module } from '@nestjs/common';
import { TokenVersionService } from './token-version.service';

/** @Global: lo inyectan el JwtAuthGuard (auth) y UsersService (users). */
@Global()
@Module({
  providers: [TokenVersionService],
  exports: [TokenVersionService],
})
export class TokenVersionModule {}
