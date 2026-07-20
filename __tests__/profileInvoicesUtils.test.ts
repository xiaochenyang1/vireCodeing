import type {
  InvoiceApplicationDetails,
  InvoiceItem,
  InvoiceRejectionReasons,
} from '../src/utils/profileLocalState';
import type { RecentOrder } from '../src/types';
import {
  createApprovedInvoiceChanges,
  createDownloadedInvoiceDetails,
  createLocalInvoiceStateFromPlatformApplications,
  createPlatformInvoiceOrderSelectionId,
  createRejectedInvoiceChanges,
  createSubmittedInvoiceChanges,
  getAvailableInvoiceableOrders,
  getInvoiceTitleText,
  getInvoiceTypeText,
  getNextInvoiceOrderSelection,
  getOccupiedInvoiceOrderIds,
  getSelectedInvoiceSummary,
  isPlatformInvoiceApplicationSnapshot,
  validateInvoiceSubmission,
  type ProfileInvoiceableOrderItem,
} from '../src/utils/profileInvoices';
import { createInvoiceableOrders } from '../src/screens/profile/profileRecordUtils';

const invoiceableOrders: ProfileInvoiceableOrderItem[] = [
  {
    id: 'invoice-order-1',
    orderId: 'HY20260620003',
    amountValue: 310,
  },
  {
    id: 'invoice-order-2',
    orderId: 'HY20260618002',
    amountValue: 260,
  },
];

const baseInvoices: InvoiceItem[] = [
  {
    id: 'invoice-1',
    title: '深圳晨星贸易有限公司',
    typeText: '电子普通发票',
    amountText: '可开票 ￥310',
    statusText: '待提交',
  },
  {
    id: 'invoice-2',
    title: '深圳星河物流有限公司',
    typeText: '电子普通发票',
    amountText: '待开票 ￥260',
    statusText: '申请中',
  },
];

describe('profile invoice utils', () => {
  it('excludes order ids occupied by submitted invoices but keeps draft and rejected invoices reusable', () => {
    const invoices: InvoiceItem[] = [
      {...baseInvoices[0], statusText: '待提交'},
      {...baseInvoices[1], statusText: '申请中'},
      {
        id: 'invoice-3',
        title: '被驳回抬头',
        typeText: '电子普通发票',
        amountText: '待开票 ￥310',
        statusText: '已驳回',
      },
    ];
    const details: Record<string, InvoiceApplicationDetails> = {
      'invoice-1': {
        invoiceTypeText: '电子普通发票',
        invoiceTitleText: '草稿抬头',
        receiverEmail: 'draft@example.com',
        selectedOrderIds: ['invoice-order-draft'],
        selectedOrderText: 'HY-DRAFT',
        invoiceAmountText: '￥1',
      },
      'invoice-2': {
        invoiceTypeText: '电子普通发票',
        invoiceTitleText: '申请中抬头',
        receiverEmail: 'active@example.com',
        selectedOrderIds: ['invoice-order-2'],
        selectedOrderText: 'HY20260618002',
        invoiceAmountText: '￥260',
      },
      'invoice-3': {
        invoiceTypeText: '电子普通发票',
        invoiceTitleText: '驳回抬头',
        receiverEmail: 'rejected@example.com',
        selectedOrderIds: ['invoice-order-1'],
        selectedOrderText: 'HY20260620003',
        invoiceAmountText: '￥310',
      },
    };

    expect(getOccupiedInvoiceOrderIds(invoices, details)).toEqual([
      'invoice-order-2',
    ]);
    expect(
      getAvailableInvoiceableOrders(invoiceableOrders, ['invoice-order-2']),
    ).toEqual([invoiceableOrders[0]]);
  });

  it('summarizes selected invoice orders in invoiceable order display order', () => {
    expect(
      getSelectedInvoiceSummary(invoiceableOrders, [
        'invoice-order-2',
        'invoice-order-1',
      ]),
    ).toEqual({
      selectedOrders: invoiceableOrders,
      selectedAmount: 570,
      selectedOrderText: 'HY20260620003、HY20260618002',
    });
  });

  it('creates local invoiceable orders with structured completion time from orders', () => {
    const invoiceableRecords = createInvoiceableOrders([
      createOrder({
        id: 'HYLOCAL999',
        updatedAtIso: '2026-06-30T08:00:00+08:00',
        updatedAtText: '订单已完成 · 刚刚',
      }),
    ]);

    expect(
      invoiceableRecords.find(item => item.orderId === 'HYLOCAL999'),
    ).toMatchObject({
      completedAtIso: '2026-06-30T08:00:00+08:00',
      completedTimeText: '刚刚',
    });
  });

  it('uses payable amount for couponed invoiceable orders', () => {
    const invoiceableRecords = createInvoiceableOrders([
      createOrder({
        id: 'HYCOUPON001',
        priceText: '￥760',
        originalPriceText: '￥760',
        couponTitleText: '满 300 减 30',
        couponDiscountText: '-￥30',
        payablePriceText: '￥730',
      }),
    ]);

    expect(
      invoiceableRecords.find(item => item.orderId === 'HYCOUPON001'),
    ).toMatchObject({
      amountValue: 730,
      amountText: '可开票 ￥730',
    });
  });

  it('creates platform invoice eligibility only from settled financial facts', () => {
    const invoiceableRecords = createInvoiceableOrders(
      [
        createOrder({
          id: 'HYPLATFORM001',
          platformOrderId: 'platform-order-1',
          status: 'transporting',
          priceText: '￥9999',
        }),
        createOrder({
          id: 'HYPLATFORM002',
          platformOrderId: 'platform-order-2',
        }),
        createOrder({
          id: 'HYPLATFORM003',
          platformOrderId: 'platform-order-3',
        }),
      ],
      {
        platformOnly: true,
        platformRecords: [
          {
            orderId: 'platform-order-1',
            orderNo: 'HYPLATFORM001',
            status: 'completed',
            paymentMethod: 'online',
            paymentStatus: 'settled',
            paymentChannel: 'wechat',
            paymentOrderStatus: 'settled',
            amountCents: 88000,
            occurredAtIso: '2026-07-15T08:00:00.000Z',
            settledAtIso: '2026-07-15T08:00:00.000Z',
            routeText: '宝安仓 → 南山门店',
          },
          {
            orderId: 'platform-order-2',
            orderNo: 'HYPLATFORM002',
            status: 'completed',
            paymentMethod: 'online',
            paymentStatus: 'refunded',
            paymentChannel: 'alipay',
            paymentOrderStatus: 'refunded',
            refundStatus: 'succeeded',
            amountCents: 85000,
            refundAmountCents: 3000,
            occurredAtIso: '2026-07-15T09:00:00.000Z',
            settledAtIso: '2026-07-15T08:30:00.000Z',
            refundedAtIso: '2026-07-15T09:00:00.000Z',
            routeText: '龙岗仓 → 福田门店',
          },
          {
            orderId: 'platform-order-3',
            orderNo: 'HYPLATFORM003',
            status: 'completed',
            paymentMethod: 'online',
            paymentStatus: 'refunded',
            paymentChannel: 'wechat',
            paymentOrderStatus: 'refunded',
            refundStatus: 'succeeded',
            amountCents: 66000,
            refundAmountCents: 66000,
            occurredAtIso: '2026-07-15T10:00:00.000Z',
            settledAtIso: '2026-07-15T09:30:00.000Z',
            refundedAtIso: '2026-07-15T10:00:00.000Z',
            routeText: '坪山仓 → 罗湖门店',
          },
        ] as never,
      },
    );

    expect(invoiceableRecords).toEqual([
      expect.objectContaining({
        id: createPlatformInvoiceOrderSelectionId('platform-order-1'),
        orderId: 'HYPLATFORM001',
        platformOrderId: 'platform-order-1',
        amountValue: 880,
        amountText: '可开票 ￥880',
      }),
      expect.objectContaining({
        id: createPlatformInvoiceOrderSelectionId('platform-order-2'),
        orderId: 'HYPLATFORM002',
        platformOrderId: 'platform-order-2',
        amountValue: 820,
        amountText: '可开票 ￥820',
      }),
    ]);
  });

  it('keeps at least one selected invoice order', () => {
    expect(
      getNextInvoiceOrderSelection(['invoice-order-1'], 'invoice-order-1'),
    ).toEqual({
      selectedInvoiceOrderIds: ['invoice-order-1'],
      notice: '至少选择一笔可开票订单',
    });
    expect(
      getNextInvoiceOrderSelection(
        ['invoice-order-1', 'invoice-order-2'],
        'invoice-order-1',
      ),
    ).toEqual({
      selectedInvoiceOrderIds: ['invoice-order-2'],
      notice: '',
    });
    expect(
      getNextInvoiceOrderSelection(['invoice-order-1'], 'invoice-order-2'),
    ).toEqual({
      selectedInvoiceOrderIds: ['invoice-order-1', 'invoice-order-2'],
      notice: '',
    });
  });

  it('validates email, selected orders, and VAT special invoice gate in the same order as the screen', () => {
    expect(
      validateInvoiceSubmission({
        receiverEmail: 'bad-email',
        selectedOrderCount: 0,
        invoiceType: 'vat-special',
        canRequestVatSpecialInvoice: false,
      }),
    ).toEqual({
      trimmedEmail: 'bad-email',
      notice: '请填写有效接收邮箱',
    });
    expect(
      validateInvoiceSubmission({
        receiverEmail: 'finance@example.com',
        selectedOrderCount: 0,
        invoiceType: 'normal',
        canRequestVatSpecialInvoice: false,
      }),
    ).toEqual({
      trimmedEmail: 'finance@example.com',
      notice: '请选择开票订单',
    });
    expect(
      validateInvoiceSubmission({
        receiverEmail: ' finance@example.com ',
        selectedOrderCount: 1,
        invoiceType: 'vat-special',
        canRequestVatSpecialInvoice: false,
      }),
    ).toEqual({
      trimmedEmail: 'finance@example.com',
      notice: '增值税专用发票需先提交企业认证资料',
    });
    expect(
      validateInvoiceSubmission({
        receiverEmail: ' finance@example.com ',
        selectedOrderCount: 1,
        invoiceType: 'vat-special',
        canRequestVatSpecialInvoice: true,
      }),
    ).toEqual({
      trimmedEmail: 'finance@example.com',
      notice: '',
    });
  });

  it('resolves invoice type and title copy from current profile state', () => {
    expect(getInvoiceTypeText('vat-special')).toBe('增值税专用发票');
    expect(getInvoiceTypeText('normal')).toBe('电子普通发票');
    expect(
      getInvoiceTitleText({
        invoiceTitle: 'enterprise',
        currentInvoiceTitle: '原抬头',
        accountDisplayName: '晨星货主',
        fallbackDisplayName: '默认货主',
        enterpriseVerification: {
          enterpriseName: '深圳星河物流有限公司',
          creditCode: '91440300MA0000000X',
          legalName: '陈星',
          legalId: '440300199001011234',
          enterprisePhone: '13800138000',
          licensePhotoCount: 1,
        },
      }),
    ).toBe('深圳星河物流有限公司');
    expect(
      getInvoiceTitleText({
        invoiceTitle: 'enterprise',
        currentInvoiceTitle: '原抬头',
        accountDisplayName: '晨星货主',
        fallbackDisplayName: '默认货主',
        enterpriseVerification: {
          enterpriseName: '深圳星河物流有限公司',
          creditCode: '91440300MA0000000X',
          legalName: '陈星',
          legalId: '440300199001011234',
          enterprisePhone: '13800138000',
          licensePhotoCount: 1,
          rejectionReason: '资料不完整',
        },
      }),
    ).toBe('原抬头');
    expect(
      getInvoiceTitleText({
        invoiceTitle: 'personal',
        currentInvoiceTitle: '原抬头',
        accountDisplayName: ' ',
        fallbackDisplayName: '默认货主',
      }),
    ).toBe('默认货主');
  });

  it('recognizes platform invoice snapshots and maps them into local invoice state', () => {
    const latestRejectedApplication = {
      id: 'invoice-platform-1',
      invoiceType: 'vat-special' as const,
      invoiceTitleType: 'enterprise' as const,
      invoiceTitle: '深圳晨星贸易有限公司',
      receiverEmail: 'vat@example.com',
      orderIds: ['platform-order-1'],
      orderNos: ['HY202607090001'],
      amountCents: 85000,
      status: 'rejected' as const,
      rejectionReason: '企业资料待补充',
      createdAtIso: '2026-07-09T08:00:00.000Z',
      updatedAtIso: '2026-07-09T09:00:00.000Z',
    };
    const previousReviewingApplication = {
      id: 'invoice-platform-2',
      invoiceType: 'normal' as const,
      invoiceTitleType: 'personal' as const,
      invoiceTitle: '张先生',
      receiverEmail: 'finance@example.com',
      orderIds: ['platform-order-2'],
      orderNos: ['HY202607080001'],
      amountCents: 26000,
      status: 'reviewing' as const,
      createdAtIso: '2026-07-08T08:00:00.000Z',
      updatedAtIso: '2026-07-08T08:05:00.000Z',
    };

    expect(isPlatformInvoiceApplicationSnapshot(latestRejectedApplication)).toBe(
      true,
    );
    expect(
      isPlatformInvoiceApplicationSnapshot({
        ...latestRejectedApplication,
        orderIds: [123],
      }),
    ).toBe(false);

    const nextState = createLocalInvoiceStateFromPlatformApplications([
      previousReviewingApplication,
      latestRejectedApplication,
    ]);

    expect(nextState.invoices).toEqual([
      {
        id: 'invoice-platform-1',
        title: '深圳晨星贸易有限公司',
        typeText: '增值税专用发票',
        amountText: '待开票 ￥850',
        statusText: '已驳回',
      },
      {
        id: 'invoice-platform-2',
        title: '张先生',
        typeText: '电子普通发票',
        amountText: '待开票 ￥260',
        statusText: '申请中',
      },
    ]);
    expect(nextState.invoiceDetails['invoice-platform-1']).toMatchObject({
      invoiceTypeText: '增值税专用发票',
      invoiceTitleText: '深圳晨星贸易有限公司',
      receiverEmail: 'vat@example.com',
      selectedOrderIds: [
        createPlatformInvoiceOrderSelectionId('platform-order-1'),
      ],
      selectedOrderText: 'HY202607090001',
      invoiceAmountText: '￥850',
      platformSynced: true,
      submittedAtIso: '2026-07-09T08:00:00.000Z',
      rejectedAtIso: '2026-07-09T09:00:00.000Z',
    });
    expect(
      nextState.invoiceDetails['invoice-platform-1'].historyEntries?.[0],
    ).toMatchObject({
      statusText: '已驳回',
      rejectionReasonText: '企业资料待补充',
    });
    expect(nextState.invoiceRejectionReasons).toEqual({
      'invoice-platform-1': '企业资料待补充',
    });
    expect(nextState.invoiceType).toBe('vat-special');
    expect(nextState.invoiceTitle).toBe('enterprise');
    expect(nextState.receiverEmail).toBe('vat@example.com');
  });

  it('creates submitted invoice state and clears stale rejection reason', () => {
    const rejectionReasons: InvoiceRejectionReasons = {
      'invoice-1': '企业认证信息待补充',
    };

    const changes = createSubmittedInvoiceChanges({
      invoiceId: 'invoice-1',
      invoices: baseInvoices,
      invoiceDetails: {},
      invoiceRejectionReasons: rejectionReasons,
      selectedOrders: invoiceableOrders,
      selectedInvoiceOrderIds: [
        'invoice-order-1',
        'invoice-order-2',
        'invoice-order-unused',
      ],
      invoiceTypeText: '增值税专用发票',
      invoiceTitleText: '深圳星河物流有限公司',
      receiverEmail: 'finance@example.com',
      selectedOrderText: 'HY20260620003、HY20260618002',
      invoiceAmountText: '￥570',
      currentTimeText: '2026-06-30 10:00',
      currentTimeIso: '2026-06-30T02:00:00.000Z',
    });

    expect(changes).toMatchObject({
      invoices: [
        {
          id: 'invoice-1',
          title: '深圳星河物流有限公司',
          statusText: '申请中',
          typeText: '增值税专用发票',
          amountText: '待开票 ￥570',
        },
        baseInvoices[1],
      ],
      invoiceRejectionReasons: {},
      selectedInvoiceOrderIds: ['invoice-order-unused'],
    });
    expect(changes?.invoiceDetails['invoice-1']).toEqual({
      invoiceTypeText: '增值税专用发票',
      invoiceTitleText: '深圳星河物流有限公司',
      receiverEmail: 'finance@example.com',
      selectedOrderIds: ['invoice-order-1', 'invoice-order-2'],
      selectedOrderText: 'HY20260620003、HY20260618002',
      invoiceAmountText: '￥570',
      submittedAtText: '2026-06-30 10:00',
      submittedAtIso: '2026-06-30T02:00:00.000Z',
      approvedAtText: undefined,
      approvedAtIso: undefined,
      rejectedAtText: undefined,
      rejectedAtIso: undefined,
      downloadedAtText: undefined,
      downloadedAtIso: undefined,
      statusHistory: [
        {
          actionText: '申请提交',
          timestampText: '2026-06-30 10:00',
          timestampIso: '2026-06-30T02:00:00.000Z',
        },
      ],
      historyEntries: [
        {
          entryId: 'invoice-1-history-1',
          sequenceNumber: 1,
          titleText: '深圳星河物流有限公司',
          typeText: '增值税专用发票',
          amountText: '￥570',
          orderText: 'HY20260620003、HY20260618002',
          submittedAtText: '2026-06-30 10:00',
          submittedAtIso: '2026-06-30T02:00:00.000Z',
          receiverEmail: 'finance@example.com',
          statusText: '申请中',
        },
      ],
    });
  });

  it('keeps history when resubmitting a rejected invoice', () => {
    const previousDetails: InvoiceApplicationDetails = {
      invoiceTypeText: '电子普通发票',
      invoiceTitleText: '旧抬头',
      receiverEmail: 'old@example.com',
      selectedOrderIds: ['invoice-order-1'],
      selectedOrderText: 'HY20260620003',
      invoiceAmountText: '￥310',
      statusHistory: [
        {actionText: '申请提交', timestampText: '2026-06-29 10:00'},
        {
          actionText: '审核驳回',
          timestampText: '2026-06-29 11:00',
          noteText: '驳回说明：企业认证信息待补充',
        },
      ],
      historyEntries: [
        {
          entryId: 'invoice-1-history-1',
          sequenceNumber: 1,
          titleText: '旧抬头',
          typeText: '电子普通发票',
          amountText: '￥310',
          orderText: 'HY20260620003',
          submittedAtText: '2026-06-29 10:00',
          receiverEmail: 'old@example.com',
          statusText: '已驳回',
          rejectionReasonText: '企业认证信息待补充',
        },
      ],
    };

    const changes = createSubmittedInvoiceChanges({
      invoiceId: 'invoice-1',
      invoices: [{...baseInvoices[0], statusText: '已驳回'}],
      invoiceDetails: {'invoice-1': previousDetails},
      invoiceRejectionReasons: {'invoice-1': '企业认证信息待补充'},
      selectedOrders: [invoiceableOrders[1]],
      selectedInvoiceOrderIds: ['invoice-order-2'],
      invoiceTypeText: '电子普通发票',
      invoiceTitleText: '新抬头',
      receiverEmail: 'new@example.com',
      selectedOrderText: 'HY20260618002',
      invoiceAmountText: '￥260',
      currentTimeText: '2026-06-30 10:00',
      currentTimeIso: '2026-06-30T02:00:00.000Z',
    });

    expect(changes?.invoiceDetails['invoice-1'].statusHistory).toEqual([
      {actionText: '申请提交', timestampText: '2026-06-29 10:00'},
      {
        actionText: '审核驳回',
        timestampText: '2026-06-29 11:00',
        noteText: '驳回说明：企业认证信息待补充',
      },
      {
        actionText: '重新提交',
        timestampText: '2026-06-30 10:00',
        timestampIso: '2026-06-30T02:00:00.000Z',
      },
    ]);
    expect(changes?.invoiceDetails['invoice-1'].historyEntries).toHaveLength(2);
    expect(changes?.invoiceDetails['invoice-1'].historyEntries?.[1]).toMatchObject({
      entryId: 'invoice-1-history-2',
      sequenceNumber: 2,
      titleText: '新抬头',
      statusText: '申请中',
      submittedAtIso: '2026-06-30T02:00:00.000Z',
    });
  });

  it('updates approval, rejection, and download details on the latest application only', () => {
    const details: Record<string, InvoiceApplicationDetails> = {
      'invoice-1': {
        invoiceTypeText: '电子普通发票',
        invoiceTitleText: '晨星货主',
        receiverEmail: 'finance@example.com',
        selectedOrderIds: ['invoice-order-1'],
        selectedOrderText: 'HY20260620003',
        invoiceAmountText: '￥310',
        statusHistory: [{actionText: '申请提交', timestampText: '10:00'}],
        historyEntries: [
          {
            entryId: 'invoice-1-history-1',
            sequenceNumber: 1,
            titleText: '旧抬头',
            typeText: '电子普通发票',
            amountText: '￥1',
            orderText: 'HY-OLD',
            submittedAtText: '09:00',
            receiverEmail: 'old@example.com',
            statusText: '已驳回',
            rejectionReasonText: '旧原因',
          },
          {
            entryId: 'invoice-1-history-2',
            sequenceNumber: 2,
            titleText: '晨星货主',
            typeText: '电子普通发票',
            amountText: '￥310',
            orderText: 'HY20260620003',
            submittedAtText: '10:00',
            receiverEmail: 'finance@example.com',
            statusText: '申请中',
          },
        ],
      },
    };

    const approved = createApprovedInvoiceChanges({
      invoiceId: 'invoice-1',
      invoices: [{...baseInvoices[0], statusText: '申请中'}],
      invoiceDetails: details,
      currentTimeText: '11:00',
      currentTimeIso: '2026-06-30T03:00:00.000Z',
    });
    expect(approved.invoices[0]).toMatchObject({
      statusText: '已开票',
      amountText: '已开票 ￥310',
    });
    expect(
      approved.invoiceDetails['invoice-1'].historyEntries?.[1],
    ).toMatchObject({
      statusText: '已开票',
      approvedAtText: '11:00',
      approvedAtIso: '2026-06-30T03:00:00.000Z',
    });
    expect(approved.invoiceDetails['invoice-1'].approvedAtIso).toBe(
      '2026-06-30T03:00:00.000Z',
    );
    expect(approved.invoiceDetails['invoice-1'].statusHistory?.[1]).toMatchObject({
      actionText: '审核通过',
      timestampIso: '2026-06-30T03:00:00.000Z',
    });

    const rejected = createRejectedInvoiceChanges({
      invoiceId: 'invoice-1',
      invoices: approved.invoices,
      invoiceDetails: approved.invoiceDetails,
      invoiceRejectionReasons: {},
      rejectionReason: '企业认证信息待补充',
      currentTimeText: '12:00',
      currentTimeIso: '2026-06-30T04:00:00.000Z',
    });
    expect(rejected.invoices[0].statusText).toBe('已驳回');
    expect(rejected.invoiceRejectionReasons).toEqual({
      'invoice-1': '企业认证信息待补充',
    });
    expect(
      rejected.invoiceDetails['invoice-1'].historyEntries?.[1],
    ).toMatchObject({
      statusText: '已驳回',
      rejectionReasonText: '企业认证信息待补充',
      approvedAtText: undefined,
      approvedAtIso: undefined,
      downloadedAtText: undefined,
      downloadedAtIso: undefined,
      rejectedAtIso: '2026-06-30T04:00:00.000Z',
    });
    expect(rejected.invoiceDetails['invoice-1']).toMatchObject({
      rejectedAtText: '12:00',
      rejectedAtIso: '2026-06-30T04:00:00.000Z',
      approvedAtText: undefined,
      approvedAtIso: undefined,
      downloadedAtText: undefined,
      downloadedAtIso: undefined,
    });

    const downloaded = createDownloadedInvoiceDetails({
      invoiceId: 'invoice-1',
      invoiceDetails: rejected.invoiceDetails,
      currentTimeText: '13:00',
      currentTimeIso: '2026-06-30T05:00:00.000Z',
    });
    expect(downloaded['invoice-1'].downloadedAtText).toBe('13:00');
    expect(downloaded['invoice-1'].downloadedAtIso).toBe(
      '2026-06-30T05:00:00.000Z',
    );
    expect(downloaded['invoice-1'].historyEntries?.[0]).toMatchObject({
      entryId: 'invoice-1-history-1',
    });
    expect(downloaded['invoice-1'].historyEntries?.[0]).not.toHaveProperty(
      'downloadedAtText',
    );
    expect(downloaded['invoice-1'].historyEntries?.[0]).not.toHaveProperty(
      'downloadedAtIso',
    );
    expect(downloaded['invoice-1'].historyEntries?.[1]).toMatchObject({
      entryId: 'invoice-1-history-2',
      downloadedAtText: '13:00',
      downloadedAtIso: '2026-06-30T05:00:00.000Z',
    });
  });
});

function createOrder(overrides: Partial<RecentOrder>): RecentOrder {
  return {
    id: 'HYLOCAL001',
    status: 'completed',
    from: '深圳南山仓',
    to: '广州天河店',
    cargoType: '建材',
    weightText: '2 吨',
    vehicleRequirement: '中型货车',
    priceText: '￥100',
    paymentMethodText: '在线支付',
    updatedAtText: '订单已完成 · 刚刚',
    ...overrides,
  };
}
