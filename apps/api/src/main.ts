import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BusinessErrorFilter } from './common/business-error.filter';
import { parseEnv } from './config/env';

type ApiApplication = {
  enableCors(options?: Record<string, unknown>): void;
  setGlobalPrefix(prefix: string): void;
  useGlobalFilters(...filters: unknown[]): void;
  listen(port: number): Promise<unknown> | unknown;
};

type ApiNestFactory = {
  create(
    module: typeof AppModule,
    options?: { rawBody: boolean },
  ): Promise<ApiApplication>;
};

export async function bootstrapApi({
  env = process.env,
  nestFactory = NestFactory,
}: BootstrapApiOptions = {}) {
  const apiEnv = parseEnv(env);
  const app = await nestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: apiEnv.NODE_ENV === 'production' ? false : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new BusinessErrorFilter());
  await app.listen(apiEnv.PORT);
}

if (require.main === module) {
  bootstrapApi().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
