import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  AdminProfileEvaluationsController,
  ProfileEvaluationsController,
} from './profile-evaluations.controller';
import type { ProfileEvaluationsService } from './profile-evaluations.service';

describe('ProfileEvaluationsController', () => {
  it('lists the current shipper evaluation records', async () => {
    const service = {
      listRecords: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [
          {
            id: 'evaluation-1',
            orderId: 'order-1',
            orderNo: 'HY202607090001',
            driverName: '平台司机 driver-1',
            rating: 5,
            tags: ['准时送达'],
            content: '服务不错',
            anonymous: false,
            photoCount: 0,
            submittedAtIso: '2026-07-09T08:00:00.000Z',
          },
        ],
      }),
    } as unknown as ProfileEvaluationsService;
    const controller = new ProfileEvaluationsController(service);

    await expect(controller.listRecords(createRequest('shipper-1'))).resolves
      .toEqual(
        expect.objectContaining({
          code: 'OK',
          data: expect.objectContaining({
            shipperId: 'shipper-1',
            items: [
              expect.objectContaining({
                id: 'evaluation-1',
                orderNo: 'HY202607090001',
              }),
            ],
          }),
          requestId: 'req_profile_evaluations_test',
        }),
      );
    expect(service.listRecords).toHaveBeenCalledWith('shipper-1');
  });

  it('rejects non-shipper users before reading evaluation records', async () => {
    const service = {
      listRecords: jest.fn(),
    } as unknown as ProfileEvaluationsService;
    const controller = new ProfileEvaluationsController(service);

    await expect(
      controller.listRecords(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.listRecords).not.toHaveBeenCalled();
  });

  it('lists the current shipper received evaluation records', async () => {
    const service = {
      listReceivedRecords: jest.fn().mockResolvedValue({
        shipperId: 'shipper-1',
        items: [
          {
            id: 'received-1',
            orderId: 'order-1',
            orderNo: 'HY202607090001',
            driverName: '平台司机 driver-1',
            rating: 5,
            tags: ['沟通顺畅'],
            content: '货主配合很好',
            anonymous: false,
            submittedAtIso: '2026-07-09T08:00:00.000Z',
          },
        ],
      }),
    } as unknown as ProfileEvaluationsService;
    const controller = new ProfileEvaluationsController(service);

    await expect(controller.listReceivedRecords(createRequest('shipper-1')))
      .resolves.toEqual(
        expect.objectContaining({
          code: 'OK',
          data: expect.objectContaining({
            shipperId: 'shipper-1',
            items: [
              expect.objectContaining({
                id: 'received-1',
                orderNo: 'HY202607090001',
              }),
            ],
          }),
          requestId: 'req_profile_evaluations_test',
        }),
      );
    expect(service.listReceivedRecords).toHaveBeenCalledWith('shipper-1');
  });
});

describe('AdminProfileEvaluationsController', () => {
  it('lists admin evaluation audit records', async () => {
    const service = {
      listAdminEvaluationAudits: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'audit-1',
            orderId: 'order-1',
            orderNo: 'HY202607090001',
            direction: 'driver_to_shipper',
            reviewerUserId: 'driver-1',
            reviewerName: '平台司机 driver-1',
            revieweeUserId: 'shipper-1',
            revieweeName: '平台货主 shipper-1',
            rating: 5,
            tags: ['沟通顺畅'],
            content: '货主配合很好',
            anonymous: false,
            photoCount: 0,
            submittedAtIso: '2026-07-09T08:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    } as unknown as ProfileEvaluationsService;
    const controller = new AdminProfileEvaluationsController(service);

    await expect(
      controller.listEvaluationAudits(createRequest('admin-1', 'admin'), {
        direction: 'driver_to_shipper',
        rating: '5',
        keyword: '  货主  ',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          total: 1,
          items: [
            expect.objectContaining({
              id: 'audit-1',
              direction: 'driver_to_shipper',
            }),
          ],
        }),
        requestId: 'req_profile_evaluations_test',
      }),
    );
    expect(service.listAdminEvaluationAudits).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      direction: 'driver_to_shipper',
      rating: 5,
      keyword: '货主',
    });
  });

  it('returns admin evaluation attachment previews', async () => {
    const service = {
      getAdminEvaluationAuditAttachments: jest.fn().mockResolvedValue({
        evaluationId: 'audit-1',
        orderId: 'order-1',
        orderNo: 'HY202607090001',
        photoCount: 1,
        items: [
          {
            id: 'file-audit-1',
            ownerUserId: 'shipper-1',
            purpose: 'evaluation',
            contentType: 'image/png',
            byteSize: 1024,
            objectKey: 'shipper-1/evaluation/file-audit-1.png',
            publicUrl: 'https://cdn.example.com/file-audit-1.png',
            status: 'uploaded',
            createdAtIso: '2026-07-09T08:00:00.000Z',
            previewUrl:
              'https://cdn.example.com/previews/file-audit-1.png?signature=test',
            previewExpiresAtIso: '2026-07-09T08:10:00.000Z',
          },
        ],
        missingFileIds: [],
      }),
    } as unknown as ProfileEvaluationsService;
    const controller = new AdminProfileEvaluationsController(service);

    await expect(
      controller.getEvaluationAttachments(
        createRequest('admin-1', 'admin'),
        'audit-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          evaluationId: 'audit-1',
          items: [expect.objectContaining({ id: 'file-audit-1' })],
        }),
        requestId: 'req_profile_evaluations_test',
      }),
    );
    expect(service.getAdminEvaluationAuditAttachments).toHaveBeenCalledWith(
      { id: 'admin-1', phone: '13900139001', userType: 'admin' },
      'audit-1',
    );
  });

  it('returns one admin evaluation audit detail', async () => {
    const service = {
      getAdminEvaluationAudit: jest.fn().mockResolvedValue({
        id: 'audit-1',
        orderId: 'order-1',
        orderNo: 'HY202607090001',
        direction: 'driver_to_shipper',
        reviewerUserId: 'driver-1',
        reviewerName: '平台司机 driver-1',
        revieweeUserId: 'shipper-1',
        revieweeName: '平台货主 shipper-1',
        rating: 5,
        tags: ['沟通顺畅'],
        content: '货主配合很好',
        anonymous: false,
        photoCount: 0,
        submittedAtIso: '2026-07-09T08:00:00.000Z',
      }),
    } as unknown as ProfileEvaluationsService;
    const controller = new AdminProfileEvaluationsController(service);

    await expect(
      controller.getEvaluationAudit(
        createRequest('admin-1', 'admin'),
        'audit-1',
      ),
    ).resolves.toMatchObject({
      code: 'OK',
      data: {
        id: 'audit-1',
        orderId: 'order-1',
        direction: 'driver_to_shipper',
      },
    });
    expect(service.getAdminEvaluationAudit).toHaveBeenCalledWith(
      { id: 'admin-1', phone: '13900139001', userType: 'admin' },
      'audit-1',
    );
  });

  it('rejects non-admin evaluation audit detail access before service calls', async () => {
    const service = {
      getAdminEvaluationAudit: jest.fn(),
    } as unknown as ProfileEvaluationsService;
    const controller = new AdminProfileEvaluationsController(service);

    await expect(
      controller.getEvaluationAudit(
        createRequest('shipper-1', 'shipper'),
        'audit-1',
      ),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.getAdminEvaluationAudit).not.toHaveBeenCalled();
  });

  it('rejects non-admin users before reading evaluation audit records', async () => {
    const service = {
      listAdminEvaluationAudits: jest.fn(),
    } as unknown as ProfileEvaluationsService;
    const controller = new AdminProfileEvaluationsController(service);

    await expect(
      controller.listEvaluationAudits(createRequest('shipper-1', 'shipper'), {}),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是管理员'),
    );
    expect(service.listAdminEvaluationAudits).not.toHaveBeenCalled();
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_evaluations_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
