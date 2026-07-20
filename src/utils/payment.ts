import type {
  PlatformPaymentChannel,
  PlatformPaymentRecord,
  PlatformPaymentSdk,
} from '../services/platformPaymentApi';
import {
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from './storage';

const PENDING_PAYMENT_STORAGE_KEY = '@vireCodeing/pending-platform-payment';
const DEFAULT_POLL_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export type PendingPlatformPayment = {
  orderId: string;
  paymentId: string;
  channel: PlatformPaymentChannel;
  idempotencyKey?: string;
  createdAtIso: string;
};

export type PendingPaymentPersistence = {
  read(): Promise<PendingPlatformPayment | undefined>;
  save(payment: PendingPlatformPayment): Promise<void>;
  remove(): Promise<void>;
};

type PaymentApi = {
  createPayment(
    orderId: string,
    request: { channel: PlatformPaymentChannel },
    idempotencyKey: string,
  ): Promise<{ replayed: boolean; payment: PlatformPaymentRecord }>;
  getLatestPayment(orderId: string): Promise<PlatformPaymentRecord>;
};

export type PlatformPaymentFlowResult = {
  status:
    | PlatformPaymentRecord['status']
    | 'sdk-cancelled'
    | 'sdk-failed';
  payment: PlatformPaymentRecord;
  message?: string;
};

export async function executePlatformPayment(input: {
  api: PaymentApi;
  sdk: PlatformPaymentSdk;
  orderId: string;
  channel: PlatformPaymentChannel;
  idempotencyKey: string;
  persistence?: PendingPaymentPersistence;
  sleep?: (durationMs: number) => Promise<void>;
  pollDelaysMs?: number[];
  now?: () => Date;
}): Promise<PlatformPaymentFlowResult> {
  const persistence = input.persistence ?? pendingPlatformPaymentPersistence;
  const created = await input.api.createPayment(
    input.orderId,
    { channel: input.channel },
    input.idempotencyKey,
  );
  const pending: PendingPlatformPayment = {
    orderId: input.orderId,
    paymentId: created.payment.id,
    channel: input.channel,
    idempotencyKey: input.idempotencyKey,
    createdAtIso: (input.now ?? (() => new Date()))().toISOString(),
  };
  return openPreparedPlatformPayment({
    api: input.api,
    sdk: input.sdk,
    payment: created.payment,
    channel: input.channel,
    pending,
    persistence,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.pollDelaysMs ? { pollDelaysMs: input.pollDelaysMs } : {}),
  });
}

export async function continuePlatformPayment(input: {
  api: Pick<PaymentApi, 'getLatestPayment'>;
  sdk: PlatformPaymentSdk;
  payment: PlatformPaymentRecord;
  channel: PlatformPaymentChannel;
  persistence?: PendingPaymentPersistence;
  sleep?: (durationMs: number) => Promise<void>;
  pollDelaysMs?: number[];
  now?: () => Date;
}): Promise<PlatformPaymentFlowResult> {
  const persistence = input.persistence ?? pendingPlatformPaymentPersistence;

  return openPreparedPlatformPayment({
    api: input.api,
    sdk: input.sdk,
    payment: input.payment,
    channel: input.channel,
    pending: {
      orderId: input.payment.orderId,
      paymentId: input.payment.id,
      channel: input.channel,
      createdAtIso: (input.now ?? (() => new Date()))().toISOString(),
    },
    persistence,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.pollDelaysMs ? { pollDelaysMs: input.pollDelaysMs } : {}),
  });
}

export async function pollPlatformPayment(input: {
  orderId: string;
  getLatestPayment(orderId: string): Promise<PlatformPaymentRecord>;
  sleep?: (durationMs: number) => Promise<void>;
  pollDelaysMs?: number[];
}): Promise<PlatformPaymentFlowResult> {
  const delays = input.pollDelaysMs ?? DEFAULT_POLL_DELAYS_MS;
  const sleep = input.sleep ?? wait;
  let latest: PlatformPaymentRecord | undefined;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    latest = await input.getLatestPayment(input.orderId);
    if (isPaymentTerminal(latest.status)) {
      return { status: latest.status, payment: latest };
    }
    if (attempt < delays.length - 1) {
      await sleep(delays[attempt]);
    }
  }

  if (!latest) {
    latest = await input.getLatestPayment(input.orderId);
  }
  return { status: 'pending', payment: latest };
}

export async function resumePendingPlatformPayment(input: {
  api: Pick<PaymentApi, 'getLatestPayment'>;
  persistence?: PendingPaymentPersistence;
  sleep?: (durationMs: number) => Promise<void>;
  pollDelaysMs?: number[];
}) {
  const persistence = input.persistence ?? pendingPlatformPaymentPersistence;
  const pending = await persistence.read();
  if (!pending) {
    return undefined;
  }

  const result = await pollPlatformPayment({
    orderId: pending.orderId,
    getLatestPayment: input.api.getLatestPayment,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.pollDelaysMs ? { pollDelaysMs: input.pollDelaysMs } : {}),
  });
  if (result.status !== 'pending') {
    await persistence.remove();
  }
  return { pending, result };
}

export const pendingPlatformPaymentPersistence: PendingPaymentPersistence = {
  read() {
    return readJsonStorage<PendingPlatformPayment>(
      PENDING_PAYMENT_STORAGE_KEY,
    );
  },
  save(payment) {
    return writeJsonStorage(PENDING_PAYMENT_STORAGE_KEY, payment);
  },
  remove() {
    return removeStorageItem(PENDING_PAYMENT_STORAGE_KEY);
  },
};

export function createPaymentIdempotencyKey() {
  const cryptoApi = (
    globalThis as typeof globalThis & {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;
  const randomUuid = cryptoApi?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const random = Math.floor(Math.random() * 16);
    const nibble = value === 'x' ? random : 8 + (random % 4);
    return nibble.toString(16);
  });
}

async function openPreparedPlatformPayment(input: {
  api: Pick<PaymentApi, 'getLatestPayment'>;
  sdk: PlatformPaymentSdk;
  payment: PlatformPaymentRecord;
  channel: PlatformPaymentChannel;
  pending: PendingPlatformPayment;
  persistence: PendingPaymentPersistence;
  sleep?: (durationMs: number) => Promise<void>;
  pollDelaysMs?: number[];
}): Promise<PlatformPaymentFlowResult> {
  await input.persistence.save(input.pending);

  if (isPaymentTerminal(input.payment.status)) {
    await input.persistence.remove();
    return { status: input.payment.status, payment: input.payment };
  }
  if (input.payment.clientPayload === undefined) {
    return {
      status: 'sdk-failed',
      payment: input.payment,
      message: '支付参数尚未准备完成',
    };
  }

  let sdkResult;
  try {
    sdkResult = await input.sdk.openPayment(
      input.channel,
      input.payment.clientPayload,
    );
  } catch {
    return {
      status: 'sdk-failed',
      payment: input.payment,
      message: '支付客户端调用失败',
    };
  }
  if (sdkResult.status === 'cancelled') {
    return {
      status: 'cancelled',
      payment: input.payment,
      ...(sdkResult.message ? { message: sdkResult.message } : {}),
    };
  }
  if (sdkResult.status === 'failed') {
    return {
      status: 'sdk-failed',
      payment: input.payment,
      ...(sdkResult.message ? { message: sdkResult.message } : {}),
    };
  }

  const result = await pollPlatformPayment({
    orderId: input.payment.orderId,
    getLatestPayment: input.api.getLatestPayment,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.pollDelaysMs ? { pollDelaysMs: input.pollDelaysMs } : {}),
  });
  if (result.status !== 'pending') {
    await input.persistence.remove();
  }
  return result;
}

function isPaymentTerminal(status: PlatformPaymentRecord['status']) {
  return !(
    status === 'pending' ||
    status === 'processing'
  );
}

function wait(durationMs: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, durationMs);
  });
}
