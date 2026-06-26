import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns service health metadata', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'truck-platform-api',
      version: '0.1.0',
    });
  });
});
