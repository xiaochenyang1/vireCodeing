import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { ApiErrorCode, BusinessError } from '../common/errors';
import {
  AdminShipperInvoicesController,
  ProfileInvoicesController,
} from './profile-invoices.controller';
import type { ProfileInvoicesService } from './profile-invoices.service';

describe('ProfileInvoicesController', () => {
  it('lists the current shipper invoice applications', async () => {
    const service = {
      listApplications: jest.fn().mockResolvedValue([
        {
          id: 'invoice-application-1',
          shipperId: 'shipper-1',
          invoiceType: 'normal',
          invoiceTitleType: 'personal',
          invoiceTitle: '晨星货主',
          receiverEmail: 'finance@chenxing.example',
          orderIds: ['order-1'],
          orderNos: ['HY202607090001'],
          amountCents: 31000,
          status: 'reviewing',
          createdAtIso: '2026-07-09T08:00:00.000Z',
          updatedAtIso: '2026-07-09T08:05:00.000Z',
        },
      ]),
    } as unknown as ProfileInvoicesService;
    const controller = new ProfileInvoicesController(service);

    await expect(
      controller.listApplications(createRequest('shipper-1')),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: [
          expect.objectContaining({
            shipperId: 'shipper-1',
            amountCents: 31000,
          }),
        ],
        requestId: 'req_profile_invoices_test',
      }),
    );
    expect(service.listApplications).toHaveBeenCalledWith('shipper-1');
  });

  it('creates the current shipper invoice application', async () => {
    const service = {
      createApplication: jest.fn().mockResolvedValue({
        id: 'invoice-application-1',
        shipperId: 'shipper-1',
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1'],
        orderNos: ['HY202607090001'],
        amountCents: 31000,
        status: 'reviewing',
        createdAtIso: '2026-07-09T08:00:00.000Z',
        updatedAtIso: '2026-07-09T08:05:00.000Z',
      }),
    } as unknown as ProfileInvoicesService;
    const controller = new ProfileInvoicesController(service);
    const body = {
      invoiceType: 'normal' as const,
      invoiceTitleType: 'personal' as const,
      invoiceTitle: '晨星货主',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1'],
    };

    await expect(
      controller.createApplication(createRequest('shipper-1'), body),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.objectContaining({
          shipperId: 'shipper-1',
          orderIds: ['order-1'],
          amountCents: 31000,
        }),
        requestId: 'req_profile_invoices_test',
      }),
    );
    expect(service.createApplication).toHaveBeenCalledWith('shipper-1', body);
  });

  it('rejects non-shipper users before reading invoice applications', async () => {
    const service = {
      listApplications: jest.fn(),
    } as unknown as ProfileInvoicesService;
    const controller = new ProfileInvoicesController(service);

    await expect(
      controller.listApplications(createRequest('driver-1', 'driver')),
    ).rejects.toMatchObject(
      new BusinessError(ApiErrorCode.AUTH_FORBIDDEN, '当前账号不是货主'),
    );
    expect(service.listApplications).not.toHaveBeenCalled();
  });
});

describe('AdminShipperInvoicesController', () => {
  it('lists invoice review events for the current admin', async () => {
    const service = {
      listAdminApplicationReviewEvents: jest.fn().mockResolvedValue([
        {
          eventId: 'invoice-application-1:approved',
          eventType: 'invoice_application_approved',
          stage: 'approved',
          noteText: '管理员已通过发票申请',
          createdAtIso: '2026-07-24T08:30:00.000Z',
        },
        {
          eventId: 'invoice-application-1:submitted',
          actorUserId: 'shipper-1',
          eventType: 'invoice_application_submitted',
          stage: 'submitted',
          noteText: '申请开票 ¥310.00，订单 HY202607240001',
          createdAtIso: '2026-07-24T08:00:00.000Z',
        },
      ]),
    } as unknown as ProfileInvoicesService;
    const controller = new AdminShipperInvoicesController(service);

    await expect(
      controller.listAdminApplicationReviewEvents(
        createRequest('admin-1', 'admin'),
        'invoice-application-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'OK',
        data: expect.arrayContaining([
          expect.objectContaining({
            eventType: 'invoice_application_approved',
            stage: 'approved',
          }),
        ]),
        requestId: 'req_profile_invoices_test',
      }),
    );
    expect(service.listAdminApplicationReviewEvents).toHaveBeenCalledWith(
      { id: 'admin-1', phone: '13900139001', userType: 'admin' },
      'invoice-application-1',
    );
  });
});

function createRequest(
  userId: string,
  userType: 'shipper' | 'driver' | 'admin' = 'shipper',
): AuthenticatedRequest {
  return {
    headers: { 'x-request-id': 'req_profile_invoices_test' },
    currentUser: { id: userId, phone: '13900139001', userType },
  };
}
