import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BusinessErrorFilter } from './common/business-error.filter';
import { parseEnv } from './config/env';

type ApiApplication = {
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

type BootstrapApiOptions = {
  env?: NodeJS.ProcessEnv;
  nestFactory?: ApiNestFactory;
};

export async function bootstrapApi({
  env = process.env,
  nestFactory = NestFactory,
}: BootstrapApiOptions = {}) {
  const apiEnv = parseEnv(env);
  const app = await nestFactory.create(AppModule, { rawBody: true });

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
