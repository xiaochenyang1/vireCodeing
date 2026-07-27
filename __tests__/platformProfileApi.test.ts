import { PlatformApiError } from '../src/services/platformApiClient';
import { createPlatformProfileApi } from '../src/services/platformProfileApi';

describe('platform profile api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('gets the shipper profile address book with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          addresses: [{ id: 'address-1', name: '宝安仓' }],
          contacts: [],
          updatedAtIso: '2026-07-03T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-03T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getAddressBook()).resolves.toMatchObject({
      shipperId: 'shipper-1',
      addresses: [{ id: 'address-1', name: '宝安仓' }],
      contacts: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/address-book',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper profile account snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          displayName: '晨星货主',
          phone: '13900139001',
          phoneProtectionEnabled: true,
          loginProtectionEnabled: true,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: false,
          privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
          privacyPolicyVersion: 'privacy-policy-v2026-07-22',
          privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
          avatarFileId: 'file-avatar-1',
          avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getAccountProfile()).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139001',
      phoneProtectionEnabled: true,
      loginProtectionEnabled: true,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: false,
      privacyConfirmedAtIso: '2026-07-22T08:30:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      avatarFileId: 'file-avatar-1',
      avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/account',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper identity verification snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          realName: '张先生',
          idNumber: '44030019900101123X',
          identityFrontFileId: 'file-front',
          identityBackFileId: 'file-back',
          faceVerified: true,
          status: 'reviewing',
          createdAtIso: '2026-07-09T08:00:00.000Z',
          updatedAtIso: '2026-07-09T08:05:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getIdentityVerification()).resolves.toEqual({
      shipperId: 'shipper-1',
      realName: '张先生',
      idNumber: '44030019900101123X',
      identityFrontFileId: 'file-front',
      identityBackFileId: 'file-back',
      faceVerified: true,
      status: 'reviewing',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:05:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/identity-verification',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper enterprise verification snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          enterpriseName: '深圳晨星贸易有限公司',
          creditCode: '91440300MA5TEST001',
          legalName: '张先生',
          legalId: '44030019900101123X',
          enterprisePhone: '13900139088',
          licenseFileId: 'file-license',
          status: 'approved',
          createdAtIso: '2026-07-09T08:00:00.000Z',
          updatedAtIso: '2026-07-09T08:05:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getEnterpriseVerification()).resolves.toEqual({
      shipperId: 'shipper-1',
      enterpriseName: '深圳晨星贸易有限公司',
      creditCode: '91440300MA5TEST001',
      legalName: '张先生',
      legalId: '44030019900101123X',
      enterprisePhone: '13900139088',
      licenseFileId: 'file-license',
      status: 'approved',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T08:05:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/enterprise-verification',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('lists admin shipper verifications and reviews identity and enterprise payloads', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            items: [
              {
                shipperId: 'shipper-1',
                identity: {
                  shipperId: 'shipper-1',
                  realName: '张先生',
                  idNumber: '44030019900101123X',
                  identityFrontFileId: 'file-front',
                  identityBackFileId: 'file-back',
                  faceVerified: true,
                  status: 'reviewing',
                  createdAtIso: '2026-07-09T08:00:00.000Z',
                  updatedAtIso: '2026-07-09T08:05:00.000Z',
                },
              },
            ],
            page: 2,
            pageSize: 10,
            total: 12,
          },
          requestId: 'req-admin-profile-list',
          timestamp: '2026-07-09T08:05:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            shipperId: 'shipper-1',
            identity: {
              shipperId: 'shipper-1',
              realName: '张先生',
              idNumber: '44030019900101123X',
              identityFrontFileId: 'file-front',
              identityBackFileId: 'file-back',
              faceVerified: true,
              status: 'approved',
              createdAtIso: '2026-07-09T08:00:00.000Z',
              updatedAtIso: '2026-07-09T08:10:00.000Z',
            },
          },
          requestId: 'req-admin-profile-identity-review',
          timestamp: '2026-07-09T08:10:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            shipperId: 'shipper-1',
            enterprise: {
              shipperId: 'shipper-1',
              enterpriseName: '深圳晨星贸易有限公司',
              creditCode: '91440300MA5TEST001',
              legalName: '张先生',
              legalId: '44030019900101123X',
              enterprisePhone: '13900139088',
              licenseFileId: 'file-license',
              status: 'rejected',
              rejectionReason: '营业执照信息待补充',
              createdAtIso: '2026-07-09T08:00:00.000Z',
              updatedAtIso: '2026-07-09T08:15:00.000Z',
            },
          },
          requestId: 'req-admin-profile-enterprise-review',
          timestamp: '2026-07-09T08:15:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: [
            {
              eventId: 'shipper-1:identity:submitted',
              verificationType: 'identity',
              actorUserId: 'shipper-1',
              eventType: 'shipper_identity_verification_submitted',
              stage: 'submitted',
              noteText: '提交身份证正反面和人脸核验',
              createdAtIso: '2026-07-09T08:00:00.000Z',
            },
          ],
          requestId: 'req-admin-profile-review-events',
          timestamp: '2026-07-09T08:20:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            shipperId: 'shipper-1',
            identity: {
              identityFront: {
                id: 'file-front',
                ownerUserId: 'shipper-1',
                purpose: 'identity',
                objectKey: 'shipper-1/identity/front.png',
                publicUrl: 'https://cdn.example.com/front.png',
                status: 'uploaded',
                createdAtIso: '2026-07-09T08:00:00.000Z',
                attachmentType: 'identityFront',
                previewUrl: 'http://localhost:3000/api/files/previews/front',
                previewExpiresAtIso: '2026-07-09T08:30:00.000Z',
              },
            },
            enterprise: {
              license: {
                id: 'file-license',
                ownerUserId: 'shipper-1',
                purpose: 'enterprise',
                objectKey: 'shipper-1/enterprise/license.png',
                publicUrl: 'https://cdn.example.com/license.png',
                status: 'uploaded',
                createdAtIso: '2026-07-09T08:00:00.000Z',
                attachmentType: 'license',
              },
            },
          },
          requestId: 'req-admin-profile-attachments',
          timestamp: '2026-07-09T08:25:00.000Z',
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminVerifications({
        status: 'reviewing',
        type: 'identity',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 12,
      items: [
        expect.objectContaining({
          shipperId: 'shipper-1',
        }),
      ],
    });

    await expect(
      api.reviewAdminIdentityVerification(' shipper-1 ', {
        status: 'approved',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      identity: expect.objectContaining({
        status: 'approved',
      }),
    });

    await expect(
      api.reviewAdminEnterpriseVerification('shipper-1', {
        status: 'rejected',
        rejectionReason: ' 营业执照信息待补充 ',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      enterprise: expect.objectContaining({
        status: 'rejected',
        rejectionReason: '营业执照信息待补充',
      }),
    });

    await expect(
      api.listAdminVerificationReviewEvents(' shipper-1 '),
    ).resolves.toEqual([
      expect.objectContaining({
        verificationType: 'identity',
        stage: 'submitted',
      }),
    ]);

    await expect(
      api.listAdminVerificationAttachments('shipper-1'),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      identity: {
        identityFront: expect.objectContaining({
          id: 'file-front',
          attachmentType: 'identityFront',
        }),
      },
      enterprise: {
        license: expect.objectContaining({
          id: 'file-license',
          attachmentType: 'license',
        }),
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/shipper-verifications?status=reviewing&type=identity&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/shipper-verifications/shipper-1/identity/review',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          status: 'approved',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/shipper-verifications/shipper-1/enterprise/review',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason: '营业执照信息待补充',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/api/admin/shipper-verifications/shipper-1/review-events',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://localhost:3000/api/admin/shipper-verifications/shipper-1/attachments',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('saves the shipper profile address book with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          addresses: [
            {
              id: 'address-local-3',
              name: '龙华临时仓',
              address: '龙华区临时中转仓',
              contactText: '吴主管 13900139001',
              tagText: '备用装货地',
            },
          ],
          contacts: [],
          updatedAtIso: '2026-07-03T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-03T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveAddressBook({
        addresses: [
          {
            id: 'address-local-3',
            name: '龙华临时仓',
            address: '龙华区临时中转仓',
            contactText: '吴主管 13900139001',
            tagText: '备用装货地',
          },
        ],
        contacts: [],
        clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
        baseUpdatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      addresses: [{ id: 'address-local-3', name: '龙华临时仓' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/address-book',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          addresses: [
            {
              id: 'address-local-3',
              name: '龙华临时仓',
              address: '龙华区临时中转仓',
              contactText: '吴主管 13900139001',
              tagText: '备用装货地',
            },
          ],
          contacts: [],
          clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
          baseUpdatedAtIso: '2026-07-03T08:30:00.000Z',
        }),
      }),
    );
  });

  it('normalizes the shipper profile address book before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          addresses: [],
          contacts: [],
          updatedAtIso: '2026-07-03T08:35:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-03T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.saveAddressBook({
      addresses: [
        {
          id: ' address-local-3 ',
          name: ' 龙华临时仓 ',
          address: ' 龙华区临时中转仓 ',
          contactText: ' 吴主管 13900139001 ',
          tagText: '  ',
        },
      ],
      contacts: [
        {
          id: ' contact-local-2 ',
          name: ' 吴主管 ',
          roleText: ' 仓库负责人 ',
          phoneText: ' 13900139001 ',
          noteText: '  ',
        },
      ],
      clientUpdatedAtIso: ' 2026-07-03T08:00:00.000Z ',
      baseUpdatedAtIso: ' ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/address-book',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          addresses: [
            {
              id: 'address-local-3',
              name: '龙华临时仓',
              address: '龙华区临时中转仓',
              contactText: '吴主管 13900139001',
            },
          ],
          contacts: [
            {
              id: 'contact-local-2',
              name: '吴主管',
              roleText: '仓库负责人',
              phoneText: '13900139001',
            },
          ],
          clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
        }),
      }),
    );
  });

  it('rejects invalid shipper profile address book requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const validRequest = {
      addresses: [
        {
          id: 'address-local-3',
          name: '龙华临时仓',
          address: '龙华区临时中转仓',
          contactText: '吴主管 13900139001',
        },
      ],
      contacts: [
        {
          id: 'contact-local-2',
          name: '吴主管',
          roleText: '仓库负责人',
          phoneText: '13900139001',
        },
      ],
      clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
      baseUpdatedAtIso: '2026-07-03T08:30:00.000Z',
    };

    const invalidRequests = [
      null,
      'bad-request',
      { ...validRequest, addresses: 'bad-addresses' },
      { ...validRequest, contacts: 'bad-contacts' },
      { ...validRequest, addresses: Array.from({ length: 21 }, (_, index) => ({
        id: `address-${index}`,
        name: '龙华临时仓',
        address: '龙华区临时中转仓',
        contactText: '吴主管 13900139001',
      })) },
      { ...validRequest, contacts: Array.from({ length: 51 }, (_, index) => ({
        id: `contact-${index}`,
        name: '吴主管',
        roleText: '仓库负责人',
        phoneText: '13900139001',
      })) },
      { ...validRequest, addresses: [{ ...validRequest.addresses[0], id: ' ' }] },
      { ...validRequest, addresses: [{ ...validRequest.addresses[0], name: 'x'.repeat(31) }] },
      { ...validRequest, addresses: [{ ...validRequest.addresses[0], address: 'x'.repeat(121) }] },
      { ...validRequest, addresses: [{ ...validRequest.addresses[0], contactText: 'x'.repeat(81) }] },
      { ...validRequest, contacts: [{ ...validRequest.contacts[0], roleText: ' ' }] },
      { ...validRequest, contacts: [{ ...validRequest.contacts[0], phoneText: '123456' }] },
      { ...validRequest, addresses: [{ ...validRequest.addresses[0], tagText: 123 }] },
      { ...validRequest, contacts: [{ ...validRequest.contacts[0], noteText: 123 }] },
      { ...validRequest, clientUpdatedAtIso: 'not-a-date' },
      { ...validRequest, baseUpdatedAtIso: 123 },
    ];

    for (const request of invalidRequests) {
      await expect(
        api.saveAddressBook(
          request as Parameters<typeof api.saveAddressBook>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_PROFILE_ADDRESS_BOOK_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the shipper profile account snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          displayName: '晨星货主',
          phone: '13900139999',
          phoneProtectionEnabled: false,
          loginProtectionEnabled: false,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: true,
          privacyConfirmedAtIso: '2026-07-22T08:35:00.000Z',
          privacyPolicyVersion: 'privacy-policy-v2026-07-22',
          privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
          avatarFileId: 'file-avatar-1',
          avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveAccountProfile({
        displayName: ' 晨星货主 ',
        avatarFileId: ' file-avatar-1 ',
        phone: ' 13900139999 ',
        phoneProtectionEnabled: false,
        loginProtectionEnabled: false,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: true,
        privacyConfirmedAtIso: ' 2026-07-22T08:35:00.000Z ',
        privacyPolicyVersion: ' privacy-policy-v2026-07-22 ',
        privacyPolicyVersionTitle: ' 隐私政策 v2026.07.22 ',
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139999',
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
      privacyConfirmedAtIso: '2026-07-22T08:35:00.000Z',
      privacyPolicyVersion: 'privacy-policy-v2026-07-22',
      privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      avatarFileId: 'file-avatar-1',
      avatarPublicUrl: 'https://cdn.example.com/avatar/file-avatar-1.png',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/account',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          displayName: '晨星货主',
          avatarFileId: 'file-avatar-1',
          phone: '13900139999',
          phoneProtectionEnabled: false,
          loginProtectionEnabled: false,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: true,
          privacyConfirmedAtIso: '2026-07-22T08:35:00.000Z',
          privacyPolicyVersion: 'privacy-policy-v2026-07-22',
          privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
        }),
      }),
    );
  });

  it('sends avatarFileId as null when clearing the current shipper avatar snapshot', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          displayName: '晨星货主',
          phone: '13900139999',
          phoneProtectionEnabled: false,
          loginProtectionEnabled: false,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: true,
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveAccountProfile({
        displayName: ' 晨星货主 ',
        avatarFileId: null,
        phone: ' 13900139999 ',
        phoneProtectionEnabled: false,
        loginProtectionEnabled: false,
        orderNotificationEnabled: true,
        promotionNotificationEnabled: true,
      }),
    ).resolves.toEqual({
      shipperId: 'shipper-1',
      displayName: '晨星货主',
      phone: '13900139999',
      phoneProtectionEnabled: false,
      loginProtectionEnabled: false,
      orderNotificationEnabled: true,
      promotionNotificationEnabled: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/account',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          displayName: '晨星货主',
          avatarFileId: null,
          phone: '13900139999',
          phoneProtectionEnabled: false,
          loginProtectionEnabled: false,
          orderNotificationEnabled: true,
          promotionNotificationEnabled: true,
        }),
      }),
    );
  });

  it('saves the shipper identity verification snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          realName: '张先生',
          idNumber: '44030019900101123X',
          identityFrontFileId: 'file-front',
          identityBackFileId: 'file-back',
          faceVerified: true,
          status: 'reviewing',
          createdAtIso: '2026-07-09T08:00:00.000Z',
          updatedAtIso: '2026-07-09T08:05:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveIdentityVerification({
        realName: ' 张先生 ',
        idNumber: '44030019900101123x',
        identityFrontFileId: ' file-front ',
        identityBackFileId: ' file-back ',
        faceVerified: true,
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      realName: '张先生',
      status: 'reviewing',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/identity-verification',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          realName: '张先生',
          idNumber: '44030019900101123X',
          identityFrontFileId: 'file-front',
          identityBackFileId: 'file-back',
          faceVerified: true,
        }),
      }),
    );
  });

  it('saves the shipper enterprise verification snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          enterpriseName: '深圳晨星贸易有限公司',
          creditCode: '91440300MA5TEST001',
          legalName: '张先生',
          legalId: '44030019900101123X',
          enterprisePhone: '13900139088',
          licenseFileId: 'file-license',
          status: 'reviewing',
          createdAtIso: '2026-07-09T08:00:00.000Z',
          updatedAtIso: '2026-07-09T08:05:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.saveEnterpriseVerification({
        enterpriseName: ' 深圳晨星贸易有限公司 ',
        creditCode: '91440300ma5test001',
        legalName: ' 张先生 ',
        legalId: '44030019900101123x',
        enterprisePhone: ' 13900139088 ',
        licenseFileId: ' file-license ',
      }),
    ).resolves.toMatchObject({
      shipperId: 'shipper-1',
      enterpriseName: '深圳晨星贸易有限公司',
      status: 'reviewing',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/enterprise-verification',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          enterpriseName: '深圳晨星贸易有限公司',
          creditCode: '91440300MA5TEST001',
          legalName: '张先生',
          legalId: '44030019900101123X',
          enterprisePhone: '13900139088',
          licenseFileId: 'file-license',
        }),
      }),
    );
  });

  it('gets the shipper invoice applications with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: [
          {
            id: 'invoice-platform-1',
            shipperId: 'shipper-1',
            invoiceType: 'normal',
            invoiceTitleType: 'personal',
            invoiceTitle: '张先生',
            receiverEmail: 'finance@example.com',
            orderIds: ['order-platform-1'],
            orderNos: ['HY202607090001'],
            amountCents: 85000,
            status: 'reviewing',
            createdAtIso: '2026-07-09T08:00:00.000Z',
            updatedAtIso: '2026-07-09T08:05:00.000Z',
          },
        ],
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getInvoices()).resolves.toEqual([
      {
        id: 'invoice-platform-1',
        shipperId: 'shipper-1',
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '张先生',
        receiverEmail: 'finance@example.com',
        orderIds: ['order-platform-1'],
        orderNos: ['HY202607090001'],
        amountCents: 85000,
        status: 'reviewing',
        createdAtIso: '2026-07-09T08:00:00.000Z',
        updatedAtIso: '2026-07-09T08:05:00.000Z',
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/invoices',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('downloads the shipper invoice application text with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '发票下载内容',
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'content-type') {
            return 'text/plain; charset=utf-8';
          }
          if (name.toLowerCase() === 'content-disposition') {
            return 'attachment; filename="invoice-platform-1.txt"';
          }

          return null;
        },
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.downloadInvoiceApplication(' invoice-platform-1 '),
    ).resolves.toEqual({
      filename: 'invoice-platform-1.txt',
      contentType: 'text/plain; charset=utf-8',
      content: '发票下载内容',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/invoices/invoice-platform-1/download',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper spending records with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          summary: {
            completedTotalCents: 31000,
            activeTotalCents: 52000,
            refundTotalCents: 26000,
          },
          items: [
            {
              orderId: 'order-platform-1',
              orderNo: 'HY202607090001',
              status: 'completed',
              paymentMethod: 'cod',
              amountCents: 31000,
              occurredAtIso: '2026-07-09T08:00:00.000Z',
              routeText: '宝安仓库 → 南山门店',
            },
          ],
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getSpendingRecords()).resolves.toEqual({
      shipperId: 'shipper-1',
      summary: {
        completedTotalCents: 31000,
        activeTotalCents: 52000,
        refundTotalCents: 26000,
      },
      items: [
        {
          orderId: 'order-platform-1',
          orderNo: 'HY202607090001',
          status: 'completed',
          paymentMethod: 'cod',
          amountCents: 31000,
          occurredAtIso: '2026-07-09T08:00:00.000Z',
          routeText: '宝安仓库 → 南山门店',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/spending-records',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper coupon wallet with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          summary: {
            usableCount: 1,
            lockedCount: 0,
            usedCount: 1,
            expiredCount: 0,
          },
          items: [
            {
              id: 'coupon-platform-1',
              shipperId: 'shipper-1',
              title: '满 300 减 30',
              status: 'usable',
              conditionText: '发单满 300 元可用',
              discountCents: 3000,
              minOrderAmountCents: 30000,
              validFromIso: '2026-07-01T00:00:00.000Z',
              validUntilIso: '2026-07-31T15:59:59.000Z',
              sourceText: '平台活动发放',
              issuedAtIso: '2026-07-09T08:00:00.000Z',
            },
          ],
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getCoupons()).resolves.toEqual({
      shipperId: 'shipper-1',
      summary: {
        usableCount: 1,
        lockedCount: 0,
        usedCount: 1,
        expiredCount: 0,
      },
      items: [
        {
          id: 'coupon-platform-1',
          shipperId: 'shipper-1',
          title: '满 300 减 30',
          status: 'usable',
          conditionText: '发单满 300 元可用',
          discountCents: 3000,
          minOrderAmountCents: 30000,
          validFromIso: '2026-07-01T00:00:00.000Z',
          validUntilIso: '2026-07-31T15:59:59.000Z',
          sourceText: '平台活动发放',
          issuedAtIso: '2026-07-09T08:00:00.000Z',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/coupons',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('issues admin shipper coupons, batch issues them, and gets the coupon report', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            id: 'coupon-platform-issue-1',
            shipperId: 'shipper-1',
            title: '后台满 500 减 50',
            status: 'usable',
            conditionText: '平台订单满 500 元可用',
            discountCents: 5000,
            minOrderAmountCents: 50000,
            validFromIso: '2026-07-09T00:00:00.000Z',
            validUntilIso: '2026-08-09T00:00:00.000Z',
            sourceText: '运营补偿',
            issuedAtIso: '2026-07-09T08:00:00.000Z',
          },
          requestId: 'req-admin-coupon-issue',
          timestamp: '2026-07-09T08:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            requestedCount: 2,
            issuedCount: 2,
            coupons: [
              {
                id: 'coupon-platform-batch-1',
                shipperId: 'shipper-1',
                title: '后台满 500 减 50',
                status: 'usable',
                conditionText: '平台订单满 500 元可用',
                discountCents: 5000,
                minOrderAmountCents: 50000,
                validFromIso: '2026-07-09T00:00:00.000Z',
                validUntilIso: '2026-08-09T00:00:00.000Z',
                sourceText: '运营补偿',
                issuedAtIso: '2026-07-09T08:05:00.000Z',
              },
              {
                id: 'coupon-platform-batch-2',
                shipperId: 'shipper-2',
                title: '后台满 500 减 50',
                status: 'usable',
                conditionText: '平台订单满 500 元可用',
                discountCents: 5000,
                minOrderAmountCents: 50000,
                validFromIso: '2026-07-09T00:00:00.000Z',
                validUntilIso: '2026-08-09T00:00:00.000Z',
                sourceText: '运营补偿',
                issuedAtIso: '2026-07-09T08:05:00.000Z',
              },
            ],
          },
          requestId: 'req-admin-coupon-batch',
          timestamp: '2026-07-09T08:05:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            generatedAtIso: '2026-07-09T08:10:00.000Z',
            summary: {
              totalCount: 3,
              usableCount: 3,
              lockedCount: 0,
              usedCount: 0,
              expiredCount: 0,
              totalDiscountCents: 15000,
              redeemedDiscountCents: 0,
            },
            sourceBreakdown: [
              {
                sourceText: '运营补偿',
                totalCount: 3,
                usedCount: 0,
                redeemedDiscountCents: 0,
              },
            ],
            topShippers: [
              {
                shipperId: 'shipper-1',
                totalCount: 2,
                usableCount: 2,
                lockedCount: 0,
                usedCount: 0,
                expiredCount: 0,
                totalDiscountCents: 10000,
                redeemedDiscountCents: 0,
                latestIssuedAtIso: '2026-07-09T08:05:00.000Z',
              },
            ],
          },
          requestId: 'req-admin-coupon-report',
          timestamp: '2026-07-09T08:10:00.000Z',
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.issueAdminCoupon({
        shipperId: ' shipper-1 ',
        title: ' 后台满 500 减 50 ',
        conditionText: ' 平台订单满 500 元可用 ',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
        sourceText: ' 运营补偿 ',
      }),
    ).resolves.toMatchObject({
      id: 'coupon-platform-issue-1',
      shipperId: 'shipper-1',
      title: '后台满 500 减 50',
    });

    await expect(
      api.batchIssueAdminCoupons({
        shipperIds: [' shipper-1 ', 'shipper-2', ' shipper-1 '],
        title: ' 后台满 500 减 50 ',
        conditionText: ' 平台订单满 500 元可用 ',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
        sourceText: ' 运营补偿 ',
      }),
    ).resolves.toMatchObject({
      requestedCount: 2,
      issuedCount: 2,
      coupons: [
        expect.objectContaining({ shipperId: 'shipper-1' }),
        expect.objectContaining({ shipperId: 'shipper-2' }),
      ],
    });

    await expect(
      api.getAdminCouponReport({ topShippersLimit: 8 }),
    ).resolves.toMatchObject({
      generatedAtIso: '2026-07-09T08:10:00.000Z',
      summary: expect.objectContaining({
        totalCount: 3,
      }),
      topShippers: [
        expect.objectContaining({
          shipperId: 'shipper-1',
        }),
      ],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/shipper-coupons',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          shipperId: 'shipper-1',
          title: '后台满 500 减 50',
          conditionText: '平台订单满 500 元可用',
          discountCents: 5000,
          minOrderAmountCents: 50000,
          validFromIso: '2026-07-09T00:00:00.000Z',
          validUntilIso: '2026-08-09T00:00:00.000Z',
          sourceText: '运营补偿',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/shipper-coupons/batch-issue',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          shipperIds: ['shipper-1', 'shipper-2'],
          title: '后台满 500 减 50',
          conditionText: '平台订单满 500 元可用',
          discountCents: 5000,
          minOrderAmountCents: 50000,
          validFromIso: '2026-07-09T00:00:00.000Z',
          validUntilIso: '2026-08-09T00:00:00.000Z',
          sourceText: '运营补偿',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/shipper-coupons/report?topShippersLimit=8',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper profile evaluation snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          items: [
            {
              id: 'evaluation-platform-1',
              orderId: 'order-platform-1',
              orderNo: 'HY202607090001',
              driverName: '平台司机 driver-1',
              rating: 5,
              tags: ['准时送达'],
              content: '平台评价内容',
              anonymous: false,
              photoCount: 1,
              photoFileIds: ['file-eval-1'],
              submittedAtIso: '2026-07-09T08:00:00.000Z',
            },
          ],
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getEvaluations()).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'evaluation-platform-1',
          orderId: 'order-platform-1',
          orderNo: 'HY202607090001',
          driverName: '平台司机 driver-1',
          rating: 5,
          tags: ['准时送达'],
          content: '平台评价内容',
          anonymous: false,
          photoCount: 1,
          photoFileIds: ['file-eval-1'],
          submittedAtIso: '2026-07-09T08:00:00.000Z',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/evaluations',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets the shipper received evaluation snapshot with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          shipperId: 'shipper-1',
          items: [
            {
              id: 'received-platform-1',
              orderId: 'order-platform-1',
              orderNo: 'HY202607090001',
              driverName: '平台司机 driver-1',
              rating: 5,
              tags: ['沟通顺畅'],
              content: '货主配合很好',
              anonymous: false,
              photoCount: 1,
              photoFileIds: ['file-received-1'],
              submittedAtIso: '2026-07-09T08:00:00.000Z',
            },
          ],
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getReceivedEvaluations()).resolves.toEqual({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'received-platform-1',
          orderId: 'order-platform-1',
          orderNo: 'HY202607090001',
          driverName: '平台司机 driver-1',
          rating: 5,
          tags: ['沟通顺畅'],
          content: '货主配合很好',
          anonymous: false,
          photoCount: 1,
          photoFileIds: ['file-received-1'],
          submittedAtIso: '2026-07-09T08:00:00.000Z',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/evaluations/received',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('lists admin evaluation audits with normalized query filters', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          items: [
            {
              id: 'audit-1',
              orderId: 'order-1',
              orderNo: 'HY202607090001',
              direction: 'shipper_to_driver',
              reviewerUserId: 'shipper-1',
              reviewerName: '货主一',
              revieweeUserId: 'driver-1',
              revieweeName: '司机一',
              rating: 5,
              tags: ['准时送达'],
              content: '评价审计记录',
              anonymous: false,
              photoCount: 1,
              photoFileIds: ['file-audit-1'],
              submittedAtIso: '2026-07-09T08:00:00.000Z',
            },
          ],
          page: 2,
          pageSize: 10,
          total: 18,
        },
        requestId: 'req-admin-evaluation-audit',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminEvaluationAudits({
        direction: 'shipper_to_driver',
        rating: 5,
        keyword: '  评价审计  ',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 18,
      items: [
        expect.objectContaining({
          id: 'audit-1',
          direction: 'shipper_to_driver',
        }),
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/evaluations?direction=shipper_to_driver&rating=5&keyword=%E8%AF%84%E4%BB%B7%E5%AE%A1%E8%AE%A1&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets one admin evaluation audit with a normalized id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'audit-1',
          orderId: 'order-1',
          orderNo: 'HY202607090001',
          direction: 'shipper_to_driver',
          reviewerUserId: 'shipper-1',
          reviewerName: '货主一',
          revieweeUserId: 'driver-1',
          revieweeName: '司机一',
          rating: 5,
          tags: ['准时送达'],
          content: '评价审计记录',
          anonymous: false,
          photoCount: 1,
          photoFileIds: ['file-audit-1'],
          submittedAtIso: '2026-07-09T08:00:00.000Z',
        },
        requestId: 'req-admin-evaluation-detail',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getAdminEvaluationAudit(' audit-1 ')).resolves.toMatchObject({
      id: 'audit-1',
      orderId: 'order-1',
      direction: 'shipper_to_driver',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/evaluations/audit-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('gets admin evaluation attachment previews with normalized ids', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          evaluationId: 'audit-1',
          orderId: 'order-1',
          orderNo: 'HY202607090001',
          photoCount: 2,
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
          missingFileIds: ['file-missing'],
        },
        requestId: 'req-admin-evaluation-attachments',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.getAdminEvaluationAuditAttachments(' audit-1 '),
    ).resolves.toMatchObject({
      evaluationId: 'audit-1',
      items: [expect.objectContaining({ id: 'file-audit-1' })],
      missingFileIds: ['file-missing'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/evaluations/audit-1/attachments',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects invalid admin evaluation audit requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const invalidDirectionQuery = {
      direction: 'driver_to_admin',
    } as unknown as Parameters<typeof api.listAdminEvaluationAudits>[0];
    const invalidRatingQuery = {
      rating: 0,
    } as unknown as Parameters<typeof api.listAdminEvaluationAudits>[0];

    await expect(
      api.listAdminEvaluationAudits(invalidDirectionQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_EVALUATION_AUDIT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.listAdminEvaluationAudits(invalidRatingQuery),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_EVALUATION_AUDIT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.getAdminEvaluationAudit('   '),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_EVALUATION_AUDIT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);

    await expect(
      api.getAdminEvaluationAuditAttachments('   '),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_EVALUATION_AUDIT_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists admin shipper invoices and reviews invoice payloads', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            items: [
              {
                id: 'invoice-platform-1',
                shipperId: 'shipper-1',
                invoiceType: 'vat-special',
                invoiceTitleType: 'enterprise',
                invoiceTitle: '深圳晨星贸易有限公司',
                receiverEmail: 'finance@example.com',
                orderIds: ['order-platform-1'],
                orderNos: ['HY202607090001'],
                amountCents: 111000,
                status: 'reviewing',
                createdAtIso: '2026-07-09T08:00:00.000Z',
                updatedAtIso: '2026-07-09T08:05:00.000Z',
              },
            ],
            page: 2,
            pageSize: 10,
            total: 12,
          },
          requestId: 'req-admin-invoice-list',
          timestamp: '2026-07-09T08:05:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            id: 'invoice-platform-1',
            shipperId: 'shipper-1',
            invoiceType: 'vat-special',
            invoiceTitleType: 'enterprise',
            invoiceTitle: '深圳晨星贸易有限公司',
            receiverEmail: 'finance@example.com',
            orderIds: ['order-platform-1'],
            orderNos: ['HY202607090001'],
            amountCents: 111000,
            status: 'rejected',
            rejectionReason: '企业认证信息待补充',
            createdAtIso: '2026-07-09T08:00:00.000Z',
            updatedAtIso: '2026-07-09T08:10:00.000Z',
          },
          requestId: 'req-admin-invoice-review',
          timestamp: '2026-07-09T08:10:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: [
            {
              eventId: 'invoice-review-event-1',
              actorUserId: 'admin-1',
              reviewerAdminId: 'admin-1',
              fromStatus: 'reviewing',
              toStatus: 'approved',
              eventType: 'invoice_application_approved',
              stage: 'approved',
              noteText: '管理员已通过发票申请',
              createdAtIso: '2026-07-09T08:15:00.000Z',
            },
          ],
          requestId: 'req-admin-invoice-review-events',
          timestamp: '2026-07-09T08:15:00.000Z',
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminInvoiceApplications({
        status: 'reviewing',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 12,
      items: [
        expect.objectContaining({
          id: 'invoice-platform-1',
          status: 'reviewing',
        }),
      ],
    });

    await expect(
      api.reviewAdminInvoiceApplication(' invoice-platform-1 ', {
        status: 'rejected',
        rejectionReason: ' 企业认证信息待补充 ',
      }),
    ).resolves.toMatchObject({
      id: 'invoice-platform-1',
      status: 'rejected',
      rejectionReason: '企业认证信息待补充',
    });

    await expect(
      api.listAdminInvoiceApplicationReviewEvents(' invoice-platform-1 '),
    ).resolves.toEqual([
      expect.objectContaining({
        actorUserId: 'admin-1',
        reviewerAdminId: 'admin-1',
        fromStatus: 'reviewing',
        toStatus: 'approved',
        stage: 'approved',
      }),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/shipper-invoices?status=reviewing&page=2&pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/shipper-invoices/invoice-platform-1/review',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason: '企业认证信息待补充',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/shipper-invoices/invoice-platform-1/review-events',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('creates the shipper invoice application with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'invoice-platform-1',
          shipperId: 'shipper-1',
          invoiceType: 'vat-special',
          invoiceTitleType: 'enterprise',
          invoiceTitle: '深圳晨星贸易有限公司',
          receiverEmail: 'finance@example.com',
          orderIds: ['order-platform-1', 'order-platform-2'],
          orderNos: ['HY202607090001', 'HY202607090002'],
          amountCents: 111000,
          status: 'reviewing',
          createdAtIso: '2026-07-09T08:00:00.000Z',
          updatedAtIso: '2026-07-09T08:05:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-09T08:05:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createInvoiceApplication({
        invoiceType: 'vat-special',
        invoiceTitleType: 'enterprise',
        invoiceTitle: ' 深圳晨星贸易有限公司 ',
        receiverEmail: ' finance@example.com ',
        orderIds: [' order-platform-1 ', ' order-platform-2 '],
      }),
    ).resolves.toMatchObject({
      id: 'invoice-platform-1',
      invoiceType: 'vat-special',
      invoiceTitleType: 'enterprise',
      invoiceTitle: '深圳晨星贸易有限公司',
      receiverEmail: 'finance@example.com',
      orderIds: ['order-platform-1', 'order-platform-2'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/profile/invoices',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          invoiceType: 'vat-special',
          invoiceTitleType: 'enterprise',
          invoiceTitle: '深圳晨星贸易有限公司',
          receiverEmail: 'finance@example.com',
          orderIds: ['order-platform-1', 'order-platform-2'],
        }),
      }),
    );
  });

  it('downloads the admin shipper invoice text with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '后台发票下载内容',
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'content-type') {
            return 'text/plain; charset=utf-8';
          }
          if (name.toLowerCase() === 'content-disposition') {
            return 'attachment; filename="invoice-platform-1.txt"';
          }

          return null;
        },
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.downloadAdminInvoiceApplication(' invoice-platform-1 '),
    ).resolves.toEqual({
      filename: 'invoice-platform-1.txt',
      contentType: 'text/plain; charset=utf-8',
      content: '后台发票下载内容',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/admin/shipper-invoices/invoice-platform-1/download',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects invalid shipper invoice application requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });
    const validRequest = {
      invoiceType: 'normal' as const,
      invoiceTitleType: 'personal' as const,
      invoiceTitle: '张先生',
      receiverEmail: 'finance@example.com',
      orderIds: ['order-platform-1'],
    };

    for (const request of [
      null,
      'bad-request',
      {...validRequest, invoiceType: 'bad-type'},
      {...validRequest, invoiceTitleType: 'bad-title-type'},
      {...validRequest, invoiceTitle: ' '},
      {...validRequest, receiverEmail: 'bad-email'},
      {...validRequest, orderIds: 'bad-order-ids'},
      {...validRequest, orderIds: []},
      {
        ...validRequest,
        orderIds: Array.from({length: 21}, (_, index) => `order-${index}`),
      },
      {...validRequest, orderIds: ['order-platform-1', 'order-platform-1']},
      {...validRequest, orderIds: [' ']},
    ]) {
      await expect(
        api.createInvoiceApplication(
          request as Parameters<typeof api.createInvoiceApplication>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_PROFILE_INVOICE_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid shipper invoice download ids before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.downloadInvoiceApplication('   ')).rejects.toMatchObject({
      code: 'PLATFORM_PROFILE_INVOICE_REQUEST_INVALID',
      status: 0,
    } satisfies Partial<PlatformApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid shipper profile account requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    for (const request of [
      null,
      'bad-request',
      { displayName: ' ' },
      { displayName: '晨'.repeat(31) },
      { displayName: '晨星货主', avatarFileId: ' ' },
      { displayName: '晨星货主', phone: '12345' },
      { displayName: '晨星货主', phoneProtectionEnabled: 'true' },
      { displayName: '晨星货主', privacyConfirmedAtIso: 123 },
      { displayName: '晨星货主', privacyConfirmedAtIso: 'not-a-date' },
      { displayName: '晨星货主', privacyPolicyVersion: 'privacy-policy-v2026-07-22' },
      {
        displayName: '晨星货主',
        privacyPolicyVersion: 'privacy-policy-v2026-07-22',
        privacyPolicyVersionTitle: '隐私政策 v2026.07.22',
      },
    ]) {
      await expect(
        api.saveAccountProfile(
          request as Parameters<typeof api.saveAccountProfile>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_PROFILE_ACCOUNT_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid shipper identity verification requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    for (const request of [
      null,
      'bad-request',
      {
        realName: '张先生',
        idNumber: 'bad-id',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: true,
      },
      {
        realName: '张先生',
        idNumber: '44030019900101123X',
        identityFrontFileId: 'file-front',
        identityBackFileId: 'file-back',
        faceVerified: false,
      },
    ]) {
      await expect(
        api.saveIdentityVerification(
          request as Parameters<typeof api.saveIdentityVerification>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_PROFILE_IDENTITY_VERIFICATION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid shipper enterprise verification requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformProfileApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    for (const request of [
      null,
      'bad-request',
      {
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: 'bad',
        legalName: '张先生',
        legalId: '44030019900101123X',
        enterprisePhone: '13900139088',
        licenseFileId: 'file-license',
      },
      {
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '张先生',
        legalId: 'bad-id',
        enterprisePhone: '13900139088',
        licenseFileId: 'file-license',
      },
      {
        enterpriseName: '深圳晨星贸易有限公司',
        creditCode: '91440300MA5TEST001',
        legalName: '张先生',
        legalId: '44030019900101123X',
        enterprisePhone: '12345',
        licenseFileId: 'file-license',
      },
    ]) {
      await expect(
        api.saveEnterpriseVerification(
          request as Parameters<typeof api.saveEnterpriseVerification>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_PROFILE_ENTERPRISE_VERIFICATION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['null admin shipper verification query', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerifications(null as never)],
    ['invalid admin shipper verification status', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerifications({ status: 'pending' as never })],
    ['invalid admin shipper verification type', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerifications({ type: 'vehicle' as never })],
    ['invalid admin shipper verification page', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerifications({ page: 0 })],
    ['invalid admin shipper verification pageSize', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerifications({ pageSize: 51 })],
    ['empty admin shipper review-events id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerificationReviewEvents('   ')],
    ['empty admin shipper attachments id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminVerificationAttachments('   ')],
    ['empty admin shipper id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminIdentityVerification('   ', { status: 'approved' })],
    ['invalid admin shipper verification review status', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminIdentityVerification('shipper-1', { status: 'reviewing' as never })],
    ['missing admin rejection reason', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminEnterpriseVerification('shipper-1', { status: 'rejected' } as never)],
    ['blank admin rejection reason', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminEnterpriseVerification('shipper-1', {
        status: 'rejected',
        rejectionReason: '   ',
      })],
    ['non-object admin review request', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminIdentityVerification('shipper-1', null as never)],
  ])(
    'rejects invalid admin shipper verification inputs before sending them: %s',
    async (_label, run) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformProfileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(run(api)).rejects.toMatchObject({
        code: 'PLATFORM_ADMIN_SHIPPER_VERIFICATION_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['null admin shipper invoice query', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminInvoiceApplications(null as never)],
    ['invalid admin shipper invoice status', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminInvoiceApplications({ status: 'pending' as never })],
    ['invalid admin shipper invoice page', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminInvoiceApplications({ page: 0 })],
    ['invalid admin shipper invoice pageSize', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminInvoiceApplications({ pageSize: 51 })],
    ['empty admin shipper invoice review-events id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.listAdminInvoiceApplicationReviewEvents('   ')],
    ['empty admin shipper invoice id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminInvoiceApplication('   ', { status: 'approved' })],
    ['empty admin shipper invoice download id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.downloadAdminInvoiceApplication('   ')],
    ['invalid admin shipper invoice review status', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminInvoiceApplication('invoice-platform-1', { status: 'reviewing' as never })],
    ['missing admin shipper invoice rejection reason', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminInvoiceApplication('invoice-platform-1', { status: 'rejected' } as never)],
    ['blank admin shipper invoice rejection reason', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminInvoiceApplication('invoice-platform-1', {
        status: 'rejected',
        rejectionReason: '   ',
      })],
    ['non-object admin shipper invoice review request', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.reviewAdminInvoiceApplication('invoice-platform-1', null as never)],
  ])(
    'rejects invalid admin shipper invoice inputs before sending them: %s',
    async (_label, run) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformProfileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(run(api)).rejects.toMatchObject({
        code: 'PLATFORM_ADMIN_SHIPPER_INVOICE_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['null admin shipper coupon issue request', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.issueAdminCoupon(null as never)],
    ['blank admin shipper coupon shipper id', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.issueAdminCoupon({
        shipperId: '   ',
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
      })],
    ['invalid admin shipper coupon discount', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.issueAdminCoupon({
        shipperId: 'shipper-1',
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 0,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
      })],
    ['invalid admin shipper coupon time window', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.issueAdminCoupon({
        shipperId: 'shipper-1',
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-08-09T00:00:00.000Z',
        validUntilIso: '2026-07-09T00:00:00.000Z',
      })],
    ['null admin shipper coupon batch issue request', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.batchIssueAdminCoupons(null as never)],
    ['empty admin shipper coupon shipperIds', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.batchIssueAdminCoupons({
        shipperIds: [],
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
      })],
    ['invalid admin shipper coupon batch issue count', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.batchIssueAdminCoupons({
        shipperIds: Array.from({ length: 51 }, (_, index) => `shipper-${index}`),
        title: '后台满 500 减 50',
        conditionText: '平台订单满 500 元可用',
        discountCents: 5000,
        minOrderAmountCents: 50000,
        validFromIso: '2026-07-09T00:00:00.000Z',
        validUntilIso: '2026-08-09T00:00:00.000Z',
      })],
    ['invalid admin shipper coupon report query', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.getAdminCouponReport({ topShippersLimit: 21 })],
    ['null admin shipper coupon report query', (api: ReturnType<typeof createPlatformProfileApi>) =>
      api.getAdminCouponReport(null as never)],
  ])(
    'rejects invalid admin shipper coupon inputs before sending them: %s',
    async (_label, run) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformProfileApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(run(api)).rejects.toMatchObject({
        code: 'PLATFORM_ADMIN_SHIPPER_COUPON_REQUEST_INVALID',
        status: 0,
      } satisfies Partial<PlatformApiError>);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
