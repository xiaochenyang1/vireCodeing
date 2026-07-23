import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function createSwaggerDocument(
  app: INestApplication,
  env: { NODE_ENV: string; PORT: number },
) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('货运接单平台 API')
      .setDescription(
        '连接货主和车主的货运接单平台 RESTful API，包含用户认证、订单管理、支付结算、司机认证等模块。',
      )
      .setVersion('1.0.0')
      .setContact('VireCodeing', 'https://github.com/xiaochenyang1/vireCodeing', '')
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '输入 Access Token（登录后获取）',
        },
        'access-token',
      )
      .build(),
  );

  if (env.NODE_ENV !== 'production') {
    document.servers = [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development Server',
      },
    ];
  }

  return document;
}
