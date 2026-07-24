import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BusinessErrorFilter } from './common/business-error.filter';
import { ZodValidationPipe } from './common/zod-validation.pipe';
import { z } from 'zod';
import { createSwaggerDocument } from './swagger-setup';
import { SwaggerModule } from '@nestjs/swagger';
import { parseEnv } from './config/env';

type ApiApplication = {
  enableCors(options?: Record<string, unknown>): void;
  setGlobalPrefix(prefix: string): void;
  useGlobalFilters(...filters: unknown[]): void;
  useGlobalPipes(...pipes: unknown[]): void;
  listen(port: number): Promise<unknown> | unknown;
};

type NestFactoryLike = {
  create(
    module: typeof AppModule,
    options: { rawBody: true },
  ): Promise<ApiApplication>;
};

const globalBodySchema = z.object({}).passthrough();

type BootstrapApiOptions = {
  env?: NodeJS.ProcessEnv;
  nestFactory?: NestFactoryLike;
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
  app.useGlobalPipes(new ZodValidationPipe(globalBodySchema));

  if (apiEnv.NODE_ENV !== 'production') {
    const swaggerApp = app as Parameters<typeof createSwaggerDocument>[0];
    const document = createSwaggerDocument(swaggerApp, {
      NODE_ENV: apiEnv.NODE_ENV,
      PORT: apiEnv.PORT,
    });
    SwaggerModule.setup('docs', swaggerApp, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
      },
    });
    console.log(`Swagger docs available at http://localhost:${apiEnv.PORT}/docs`);
  }

  await app.listen(apiEnv.PORT);
}

if (require.main === module) {
  bootstrapApi().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
