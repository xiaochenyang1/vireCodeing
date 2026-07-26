import { PlatformApiError } from '../src/services/platformApiClient';
import { createPlatformSupportTicketsApi } from '../src/services/platformSupportTicketsApi';

describe('platform support tickets api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('gets the shipper support tickets with bearer token', async () => {
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
              id: 'ticket-1',
              shipperId: 'shipper-1',
              channelName: '投诉建议',
              description: '司机沟通不及时，希望客服协助跟进',
              status: 'processing',
              statusHistory: [
                {
                  actionText: '工单已提交',
                  timestampIso: '2026-07-22T08:30:00.000Z',
                },
              ],
              sla: {
                policyKey: 'support_ticket_default_v1',
                stage: 'resolution',
                status: 'within_target',
                targetAtIso: '2026-07-23T08:35:00.000Z',
                remainingMinutes: 1440,
              },
              createdAtIso: '2026-07-22T08:30:00.000Z',
              updatedAtIso: '2026-07-22T08:35:00.000Z',
            },
          ],
        },
        requestId: 'req-test',
        timestamp: '2026-07-22T08:35:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getSupportTickets()).resolves.toMatchObject({
      shipperId: 'shipper-1',
      items: [
        {
          id: 'ticket-1',
          channelName: '投诉建议',
          sla: {
            stage: 'resolution',
          },
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/support-tickets',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('creates the shipper support ticket with bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'ticket-1',
          shipperId: 'shipper-1',
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
          status: 'pending',
          statusHistory: [
            {
              actionText: '工单已提交',
              timestampIso: '2026-07-22T08:30:00.000Z',
            },
          ],
          sla: {
            policyKey: 'support_ticket_default_v1',
            stage: 'first_response',
            status: 'within_target',
            targetAtIso: '2026-07-22T09:00:00.000Z',
            remainingMinutes: 30,
          },
          createdAtIso: '2026-07-22T08:30:00.000Z',
          updatedAtIso: '2026-07-22T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-22T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.createSupportTicket({
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
      }),
    ).resolves.toMatchObject({
      id: 'ticket-1',
      channelName: '投诉建议',
      status: 'pending',
      sla: {
        stage: 'first_response',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/support-tickets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
        }),
      }),
    );
  });

  it('normalizes the support ticket request before sending it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'OK',
        message: 'success',
        data: {
          id: 'ticket-1',
          shipperId: 'shipper-1',
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
          status: 'pending',
          statusHistory: [],
          sla: {
            policyKey: 'support_ticket_default_v1',
            stage: 'first_response',
            status: 'within_target',
            targetAtIso: '2026-07-22T09:00:00.000Z',
            remainingMinutes: 30,
          },
          createdAtIso: '2026-07-22T08:30:00.000Z',
          updatedAtIso: '2026-07-22T08:30:00.000Z',
        },
        requestId: 'req-test',
        timestamp: '2026-07-22T08:30:00.000Z',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await api.createSupportTicket({
      channelName: ' 投诉建议 ',
      description: ' 司机沟通不及时，希望客服协助跟进 ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/shipper/support-tickets',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          channelName: '投诉建议',
          description: '司机沟通不及时，希望客服协助跟进',
        }),
      }),
    );
  });

  it('lists and mutates admin support tickets with normalized payloads', async () => {
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
                id: 'ticket-1',
                shipperId: 'shipper-1',
                channelName: '投诉建议',
                description: '司机沟通不及时，希望客服协助跟进',
                status: 'pending',
                statusHistory: [
                  {
                    actionText: '工单已提交',
                    timestampIso: '2026-07-22T08:30:00.000Z',
                  },
                ],
                sla: {
                  policyKey: 'support_ticket_default_v1',
                  stage: 'first_response',
                  status: 'within_target',
                  targetAtIso: '2026-07-22T09:00:00.000Z',
                  remainingMinutes: 30,
                },
                createdAtIso: '2026-07-22T08:30:00.000Z',
                updatedAtIso: '2026-07-22T08:30:00.000Z',
              },
            ],
            page: 2,
            pageSize: 10,
            total: 11,
          },
          requestId: 'req-admin-list',
          timestamp: '2026-07-22T08:30:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            id: 'ticket-1',
            shipperId: 'shipper-1',
            channelName: '投诉建议',
            description: '司机沟通不及时，希望客服协助跟进',
            status: 'pending',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
            ],
            sla: {
              policyKey: 'support_ticket_default_v1',
              stage: 'first_response',
              status: 'within_target',
              targetAtIso: '2026-07-22T09:00:00.000Z',
              remainingMinutes: 30,
            },
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:30:00.000Z',
          },
          requestId: 'req-admin-detail',
          timestamp: '2026-07-22T08:30:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            id: 'ticket-1',
            shipperId: 'shipper-1',
            channelName: '投诉建议',
            description: '司机沟通不及时，希望客服协助跟进',
            status: 'pending',
            claimedByAdminUserId: 'admin-2',
            claimedAtIso: '2026-07-22T08:32:00.000Z',
            claimNote: '夜班客服先认领跟进。',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
              {
                actionText: '客服已认领',
                timestampIso: '2026-07-22T08:32:00.000Z',
                operatorUserId: 'admin-2',
                content: '夜班客服先认领跟进。',
              },
            ],
            sla: {
              policyKey: 'support_ticket_default_v1',
              stage: 'first_response',
              status: 'within_target',
              targetAtIso: '2026-07-22T09:00:00.000Z',
              remainingMinutes: 28,
            },
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:32:00.000Z',
          },
          requestId: 'req-admin-claim',
          timestamp: '2026-07-22T08:32:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            id: 'ticket-1',
            shipperId: 'shipper-1',
            channelName: '投诉建议',
            description: '司机沟通不及时，希望客服协助跟进',
            status: 'processing',
            claimedByAdminUserId: 'admin-2',
            claimedAtIso: '2026-07-22T08:32:00.000Z',
            claimNote: '夜班客服先认领跟进。',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
              {
                actionText: '客服已认领',
                timestampIso: '2026-07-22T08:32:00.000Z',
                operatorUserId: 'admin-2',
                content: '夜班客服先认领跟进。',
              },
              {
                actionText: '客服已受理',
                timestampIso: '2026-07-22T08:35:00.000Z',
                fromStatus: 'pending',
                toStatus: 'processing',
                operatorUserId: 'admin-1',
                content: '已联系货主核实问题，转客服受理跟进。',
              },
            ],
            sla: {
              policyKey: 'support_ticket_default_v1',
              stage: 'resolution',
              status: 'within_target',
              targetAtIso: '2026-07-23T08:35:00.000Z',
              remainingMinutes: 1440,
            },
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:35:00.000Z',
          },
          requestId: 'req-admin-process',
          timestamp: '2026-07-22T08:35:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 'OK',
          message: 'success',
          data: {
            id: 'ticket-1',
            shipperId: 'shipper-1',
            channelName: '投诉建议',
            description: '司机沟通不及时，希望客服协助跟进',
            status: 'resolved',
            claimedByAdminUserId: 'admin-2',
            claimedAtIso: '2026-07-22T08:32:00.000Z',
            claimNote: '夜班客服先认领跟进。',
            statusHistory: [
              {
                actionText: '工单已提交',
                timestampIso: '2026-07-22T08:30:00.000Z',
              },
              {
                actionText: '客服已认领',
                timestampIso: '2026-07-22T08:32:00.000Z',
                operatorUserId: 'admin-2',
                content: '夜班客服先认领跟进。',
              },
              {
                actionText: '客服已受理',
                timestampIso: '2026-07-22T08:35:00.000Z',
                fromStatus: 'pending',
                toStatus: 'processing',
                operatorUserId: 'admin-1',
                content: '已联系货主核实问题，转客服受理跟进。',
              },
              {
                actionText: '客服已处理',
                timestampIso: '2026-07-22T08:40:00.000Z',
                fromStatus: 'processing',
                toStatus: 'resolved',
                operatorUserId: 'admin-1',
                content: '问题已确认并处理完成，通知货主查看结果。',
              },
            ],
            sla: {
              policyKey: 'support_ticket_default_v1',
              stage: 'resolution',
              status: 'resolved_within_target',
              targetAtIso: '2026-07-23T08:35:00.000Z',
              remainingMinutes: 1435,
            },
            createdAtIso: '2026-07-22T08:30:00.000Z',
            updatedAtIso: '2026-07-22T08:40:00.000Z',
          },
          requestId: 'req-admin-resolve',
          timestamp: '2026-07-22T08:40:00.000Z',
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.listAdminSupportTickets({
        page: 2,
        pageSize: 10,
        status: 'pending',
        slaStatus: 'within_target',
        keyword: ' shipper-1 ',
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 11,
      items: [
        expect.objectContaining({
          id: 'ticket-1',
          status: 'pending',
          sla: expect.objectContaining({
            stage: 'first_response',
          }),
        }),
      ],
    });

    await expect(api.getAdminSupportTicket(' ticket-1 ')).resolves.toMatchObject(
      {
        id: 'ticket-1',
        status: 'pending',
        sla: {
          stage: 'first_response',
        },
      },
    );

    await expect(
      api.claimAdminSupportTicket(' ticket-1 ', {
        baseUpdatedAtIso: ' 2026-07-22T08:30:00.000Z ',
        content: ' 夜班客服先认领跟进。 ',
      }),
    ).resolves.toMatchObject({
      id: 'ticket-1',
      status: 'pending',
      claimedByAdminUserId: 'admin-2',
      claimNote: '夜班客服先认领跟进。',
    });

    await expect(
      api.processAdminSupportTicket(' ticket-1 ', {
        baseUpdatedAtIso: ' 2026-07-22T08:32:00.000Z ',
        content: ' 已联系货主核实问题，转客服受理跟进。 ',
      }),
    ).resolves.toMatchObject({
      id: 'ticket-1',
      status: 'processing',
      claimedByAdminUserId: 'admin-2',
      sla: {
        stage: 'resolution',
      },
      statusHistory: [
        expect.objectContaining({
          actionText: '工单已提交',
        }),
        expect.objectContaining({
          actionText: '客服已认领',
          operatorUserId: 'admin-2',
        }),
        expect.objectContaining({
          actionText: '客服已受理',
          operatorUserId: 'admin-1',
        }),
      ],
    });

    await expect(
      api.resolveAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: ' 2026-07-22T08:35:00.000Z ',
        content: ' 问题已确认并处理完成，通知货主查看结果。 ',
      }),
    ).resolves.toMatchObject({
      id: 'ticket-1',
      status: 'resolved',
      sla: {
        stage: 'resolution',
        status: 'resolved_within_target',
      },
      statusHistory: expect.arrayContaining([
        expect.objectContaining({
          actionText: '客服已处理',
          operatorUserId: 'admin-1',
        }),
      ]),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/admin/support-tickets?page=2&pageSize=10&status=pending&slaStatus=within_target&keyword=shipper-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/admin/support-tickets/ticket-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/admin/support-tickets/ticket-1/claim',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
          content: '夜班客服先认领跟进。',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/api/admin/support-tickets/ticket-1/process',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-22T08:32:00.000Z',
          content: '已联系货主核实问题，转客服受理跟进。',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://localhost:3000/api/admin/support-tickets/ticket-1/resolve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({
          baseUpdatedAtIso: '2026-07-22T08:35:00.000Z',
          content: '问题已确认并处理完成，通知货主查看结果。',
        }),
      }),
    );
  });

  it('rejects invalid support ticket requests before sending them', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    for (const request of [
      null,
      'bad-request',
      { channelName: ' ', description: '司机沟通不及时，希望客服协助跟进' },
      { channelName: '投诉建议', description: ' ' },
      { channelName: '投诉建议', description: '问'.repeat(201) },
    ]) {
      await expect(
        api.createSupportTicket(
          request as Parameters<typeof api.createSupportTicket>[0],
        ),
      ).rejects.toMatchObject({
        code: 'PLATFORM_SUPPORT_TICKET_REQUEST_INVALID',
        status: 0,
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['null admin query', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.listAdminSupportTickets(null as never)],
    ['invalid admin page', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.listAdminSupportTickets({ page: 0 })],
    ['invalid admin pageSize', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.listAdminSupportTickets({ pageSize: 51 })],
    ['invalid admin status', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.listAdminSupportTickets({ status: 'closed' as never })],
    ['invalid admin slaStatus', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.listAdminSupportTickets({ slaStatus: 'missing' as never })],
    ['invalid admin keyword', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.listAdminSupportTickets({ keyword: '问'.repeat(81) })],
    ['empty admin ticket id', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.getAdminSupportTicket('   ')],
    ['invalid admin claim request', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.claimAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: 'bad-date',
      })],
    ['overlong admin claim content', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.claimAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
        content: '问'.repeat(201),
      })],
    ['non-object admin claim request', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.claimAdminSupportTicket('ticket-1', null as never)],
    ['invalid admin update request', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.processAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: 'bad-date',
        content: '已联系货主核实问题，转客服受理跟进。',
      })],
    ['short admin update content', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.resolveAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: '2026-07-22T08:35:00.000Z',
        content: '太短',
      })],
    ['non-object admin update request', (api: ReturnType<typeof createPlatformSupportTicketsApi>) =>
      api.processAdminSupportTicket('ticket-1', null as never)],
  ])(
    'rejects invalid admin support ticket inputs before sending them: %s',
    async (_label, run) => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const api = createPlatformSupportTicketsApi({
        baseUrl: 'http://localhost:3000/api',
        getAccessToken: () => 'access-token',
      });

      await expect(run(api)).rejects.toMatchObject({
        code: 'PLATFORM_SUPPORT_TICKET_REQUEST_INVALID',
        status: 0,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('throws auth access token missing before sending requests without a token', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => undefined,
    });

    await expect(api.getSupportTickets()).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(
      api.createSupportTicket({
        channelName: '投诉建议',
        description: '司机沟通不及时，希望客服协助跟进',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(api.listAdminSupportTickets()).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(api.getAdminSupportTicket('ticket-1')).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(
      api.claimAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(
      api.processAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
        content: '已联系货主核实问题，转客服受理跟进。',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );
    await expect(
      api.resolveAdminSupportTicket('ticket-1', {
        baseUpdatedAtIso: '2026-07-22T08:35:00.000Z',
        content: '问题已确认并处理完成，通知货主查看结果。',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTH_ACCESS_TOKEN_MISSING',
        status: 0,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps network failures to platform api errors', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const api = createPlatformSupportTicketsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.getSupportTickets()).rejects.toEqual(
      new PlatformApiError('Platform API network request failed', 'NETWORK_ERROR', 0),
    );
  });
});
