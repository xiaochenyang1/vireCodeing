import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOnlyGuard, ShipperOnlyGuard } from '../auth/role.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinanceController } from './admin-finance.controller';
import {
  PrismaAdminFinanceRepository,
  type PrismaAdminFinanceClient,
} from './admin-finance.repository';
import { AdminFinanceService } from './admin-finance.service';
import { AlipayPaymentProvider } from './alipay-payment.provider';
import {
  PrismaDriverFinanceRepository,
  type PrismaDriverFinanceClient,
} from './driver-finance.repository';
import { FinancialOutboxWorker } from './financial-outbox.worker';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import type {
  PaymentProvider,
  PaymentProviderChannel,
} from './payment-provider';
import { PaymentsController } from './payments.controller';
import {
  PrismaPaymentsRepository,
  type PrismaPaymentsClient,
} from './payments.repository';
import {
  PaymentsService,
  type PaymentProviderResolver,
} from './payments.service';
import { SandboxPaymentProvider } from './sandbox-payment.provider';
import { WechatPaymentProvider } from './wechat-payment.provider';

export const paymentProviderResolverToken = 'PaymentProviderResolver';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    PaymentsController,
    PaymentCallbacksController,
    AdminFinanceController,
  ],
  providers: [
    {
      provide: PrismaPaymentsRepository,
      useFactory: (prisma: PrismaService) =>
        new PrismaPaymentsRepository(
          prisma as unknown as PrismaPaymentsClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: PrismaDriverFinanceRepository,
      useFactory: (prisma: PrismaService) =>
        new PrismaDriverFinanceRepository(
          prisma as unknown as PrismaDriverFinanceClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: PrismaAdminFinanceRepository,
      useFactory: (prisma: PrismaService) =>
        new PrismaAdminFinanceRepository(
          prisma as unknown as PrismaAdminFinanceClient,
        ),
      inject: [PrismaService],
    },
    {
      provide: paymentProviderResolverToken,
      useFactory: () => createPaymentProviderResolverFromEnv(process.env),
    },
    {
      provide: PaymentsService,
      useFactory: (
        repository: PrismaPaymentsRepository,
        resolver: PaymentProviderResolver,
      ) =>
        new PaymentsService(repository, resolver, {
          paymentExpiresSeconds: parsePositiveInteger(
            process.env.PAYMENT_ORDER_TTL_SECONDS,
            900,
          ),
        }),
      inject: [PrismaPaymentsRepository, paymentProviderResolverToken],
    },
    {
      provide: AdminFinanceService,
      useFactory: (
        repository: PrismaAdminFinanceRepository,
        driverFinanceRepository: PrismaDriverFinanceRepository,
      ) => new AdminFinanceService(repository, driverFinanceRepository),
      inject: [
        PrismaAdminFinanceRepository,
        PrismaDriverFinanceRepository,
      ],
    },
    {
      provide: FinancialOutboxWorker,
      useFactory: (
        repository: PrismaPaymentsRepository,
        paymentsService: PaymentsService,
      ) =>
        new FinancialOutboxWorker(repository, paymentsService, {
          workerId:
            process.env.REFUND_OUTBOX_WORKER_ID ?? 'api-refund-worker',
        }),
      inject: [PrismaPaymentsRepository, PaymentsService],
    },
    ShipperOnlyGuard,
    AdminOnlyGuard,
  ],
  exports: [PaymentsService, AdminFinanceService, FinancialOutboxWorker],
})
export class PaymentsModule {}

export function createPaymentProviderResolverFromEnv(
  env: NodeJS.ProcessEnv,
): PaymentProviderResolver {
  const mode = env.PAYMENT_PROVIDER_MODE ?? 'disabled';
  const providers = new Map<PaymentProviderChannel, PaymentProvider>();

  if (mode === 'sandbox') {
    const sandbox = new SandboxPaymentProvider({
      secret: requireEnv(env, 'PAYMENT_SANDBOX_SECRET'),
    });
    return channel => {
      if (
        channel === 'sandbox' ||
        channel === 'wechat' ||
        channel === 'alipay'
      ) {
        return sandbox;
      }
      return throwProviderUnavailable();
    };
  }

  if (mode === 'wechat' || mode === 'wechat-alipay') {
    const callbackBaseUrl = requireEnv(env, 'PAYMENT_CALLBACK_BASE_URL');
    providers.set(
      'wechat',
      new WechatPaymentProvider({
        appId: requireEnv(env, 'WECHAT_PAY_APP_ID'),
        mchId: requireEnv(env, 'WECHAT_PAY_MCH_ID'),
        merchantSerialNo: requireEnv(
          env,
          'WECHAT_PAY_MERCHANT_SERIAL_NO',
        ),
        merchantPrivateKeyPem: normalizePem(
          requireEnv(env, 'WECHAT_PAY_MERCHANT_PRIVATE_KEY_PEM'),
        ),
        platformSerialNo: requireEnv(
          env,
          'WECHAT_PAY_PLATFORM_SERIAL_NO',
        ),
        platformPublicKeyPem: normalizePem(
          requireEnv(env, 'WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM'),
        ),
        apiV3Key: requireEnv(env, 'WECHAT_PAY_API_V3_KEY'),
        paymentNotifyUrl: createCallbackUrl(
          callbackBaseUrl,
          'payment/wechat',
        ),
        refundNotifyUrl: createCallbackUrl(
          callbackBaseUrl,
          'refund/wechat',
        ),
      }),
    );
  }

  if (mode === 'alipay' || mode === 'wechat-alipay') {
    const callbackBaseUrl = requireEnv(env, 'PAYMENT_CALLBACK_BASE_URL');
    providers.set(
      'alipay',
      new AlipayPaymentProvider({
        appId: requireEnv(env, 'ALIPAY_APP_ID'),
        sellerId: requireEnv(env, 'ALIPAY_SELLER_ID'),
        merchantPrivateKeyPem: normalizePem(
          requireEnv(env, 'ALIPAY_MERCHANT_PRIVATE_KEY_PEM'),
        ),
        alipayPublicKeyPem: normalizePem(
          requireEnv(env, 'ALIPAY_PUBLIC_KEY_PEM'),
        ),
        notifyUrl: createCallbackUrl(callbackBaseUrl, 'payment/alipay'),
      }),
    );
  }

  if (mode !== 'disabled' && providers.size === 0) {
    throw new Error(`Unsupported PAYMENT_PROVIDER_MODE: ${mode}`);
  }

  return channel =>
    providers.get(channel) ?? throwProviderUnavailable();
}

function throwProviderUnavailable(): never {
  throw new BusinessError(
    ApiErrorCode.PAYMENT_CHANNEL_UNAVAILABLE,
    '支付渠道暂时不可用',
  );
}

function requireEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function createCallbackUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/api/callbacks/${path}`;
}

function normalizePem(value: string) {
  return value.replace(/\\n/g, '\n');
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('PAYMENT_ORDER_TTL_SECONDS must be a positive integer');
  }
  return parsed;
}
