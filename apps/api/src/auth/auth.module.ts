import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: InMemoryVerificationCodeStore,
      useFactory: () => new InMemoryVerificationCodeStore(),
    },
    {
      provide: TokenService,
      useFactory: () =>
        new TokenService({
          accessTtlSeconds: 900,
          refreshTtlSeconds: 604800,
        }),
    },
    {
      provide: AuthService,
      useFactory: (
        codeStore: InMemoryVerificationCodeStore,
        tokenService: TokenService,
      ) => new AuthService(codeStore, tokenService),
      inject: [InMemoryVerificationCodeStore, TokenService],
    },
  ],
})
export class AuthModule {}
