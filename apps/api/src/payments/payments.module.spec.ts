jest.mock('@nestjs/throttler', () => ({
  ThrottlerModule: {
    forRoot: jest.fn(() => ({
      module: class MockThrottlerModule {},
    })),
  },
}));

import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { ApiErrorCode } from '../common/errors';
import { AdminFinanceService } from './admin-finance.service';
import { FinancialOutboxWorker } from './financial-outbox.worker';
import { PaymentsService } from './payments.service';
import {
  PaymentsModule,
  createPaymentProviderResolverFromEnv,
} from './payments.module';

describe('PaymentsModule', () => {
  it('keeps provider resolution disabled unless configured', () => {
    const resolver = createPaymentProviderResolverFromEnv({
      PAYMENT_PROVIDER_MODE: 'disabled',
    });

    expect(() => resolver('wechat')).toThrow(
      expect.objectContaining({ code: ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE }),
    );
  });

  it('uses the sandbox provider for local payment and callback channels', () => {
    const resolver = createPaymentProviderResolverFromEnv({
      PAYMENT_PROVIDER_MODE: 'sandbox',
      PAYMENT_SANDBOX_SECRET: 's'.repeat(32),
    });

    expect(resolver('wechat').channel).toBe('sandbox');
    expect(resolver('alipay').channel).toBe('sandbox');
    expect(resolver('sandbox').channel).toBe('sandbox');
  });

  it('compiles services and the refund worker through Nest DI', async () => {
    const previousMode = process.env.PAYMENT_PROVIDER_MODE;
    process.env.PAYMENT_PROVIDER_MODE = 'disabled';
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [PaymentsModule],
      }).compile();

      expect(moduleRef.get(PaymentsService)).toBeInstanceOf(PaymentsService);
      expect(moduleRef.get(AdminFinanceService)).toBeInstanceOf(
        AdminFinanceService,
      );
      expect(moduleRef.get(FinancialOutboxWorker)).toBeInstanceOf(
        FinancialOutboxWorker,
      );
      await moduleRef.close();
    } finally {
      if (previousMode === undefined) {
        delete process.env.PAYMENT_PROVIDER_MODE;
      } else {
        process.env.PAYMENT_PROVIDER_MODE = previousMode;
      }
    }
  });

  it('is imported by the application module', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];
    expect(imports).toContain(PaymentsModule);
  });
});
