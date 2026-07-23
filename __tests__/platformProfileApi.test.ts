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
});
