import { Controller, Get } from '@nestjs/common';

type HealthResponse = {
  status: 'ok';
  service: 'truck-platform-api';
  version: '0.1.0';
};

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'truck-platform-api',
      version: '0.1.0',
    };
  }
}
