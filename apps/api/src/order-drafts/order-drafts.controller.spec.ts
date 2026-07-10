import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { OrderDraftsService } from './order-drafts.service';
import { OrderDraftsController } from './order-drafts.controller';

describe('OrderDraftsController', () => {
  it('gets the current shipper draft', async () => {
    const service = {
      getDraft: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        draftSnapshot: { pickupAddress: '宝安临时仓' },
      }),
    } as unknown as OrderDraftsService;
    const controller = new OrderDraftsController(service);

    await expect(controller.getDraft(createRequest('shipper-1'))).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        draftSnapshot: { pickupAddress: '宝安临时仓' },
      },
      requestId: 'req_draft_test',
    });
    expect(service.getDraft).toHaveBeenCalledWith('shipper-1');
  });

  it('returns null data when the current shipper has no draft', async () => {
    const service = {
      getDraft: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderDraftsService;
    const controller = new OrderDraftsController(service);

    await expect(controller.getDraft(createRequest('shipper-1'))).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: null,
        requestId: 'req_draft_test',
      }),
    );
    expect(service.getDraft).toHaveBeenCalledWith('shipper-1');
  });

  it('saves the current shipper draft', async () => {
    const service = {
      saveDraft: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        draftSnapshot: { pickupAddress: '宝安临时仓' },
      }),
    } as unknown as OrderDraftsService;
    const controller = new OrderDraftsController(service);
    const body = {
      draftSnapshot: { pickupAddress: '宝安临时仓' },
    };

    await expect(
      controller.saveDraft(createRequest('shipper-1'), body),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        shipperId: 'shipper-1',
        draftSnapshot: { pickupAddress: '宝安临时仓' },
      },
      requestId: 'req_draft_test',
    });
    expect(service.saveDraft).toHaveBeenCalledWith('shipper-1', body);
  });

  it('rejects non-shipper users before reading draft data', async () => {
    const service = {
      getDraft: jest.fn(),
    } as unknown as OrderDraftsService;
    const controller = new OrderDraftsController(service);

    await expect(
      controller.getDraft(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.getDraft).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_draft_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
