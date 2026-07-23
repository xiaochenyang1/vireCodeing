import type {
  EnterpriseVerificationRequest,
  InvoiceApplicationDetails,
  InvoiceHistoryEntry,
  InvoiceItem,
  InvoiceRejectionReasons,
  InvoiceStatusHistoryItem,
  InvoiceTitleOption,
  InvoiceTypeOption,
} from './profileLocalState';

export type ProfileInvoiceableOrderItem = {
  id: string;
  orderId: string;
  amountValue: number;
  completedAtIso?: string;
  platformOrderId?: string;
};

export type PlatformInvoiceApplicationSnapshot = {
  id: string;
  invoiceType: InvoiceTypeOption;
  invoiceTitleType: InvoiceTitleOption;
  invoiceTitle: string;
  receiverEmail: string;
  orderIds: string[];
  orderNos: string[];
  amountCents: number;
  status: 'reviewing' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export const invoiceTypeOptions: Array<{
  id: InvoiceTypeOption;
  label: string;
}> = [
  {id: 'normal', label: '电子普通发票'},
  {id: 'vat-special', label: '增值税专用发票'},
];

export const invoiceTitleOptions: Array<{
  id: InvoiceTitleOption;
  label: string;
}> = [
  {id: 'enterprise', label: '企业抬头'},
  {id: 'personal', label: '个人抬头'},
];

export const DEFAULT_INVOICE_REJECTION_REASON = '企业认证信息待补充';

export function canRequestVatSpecialInvoice(
  enterpriseVerification?: EnterpriseVerificationRequest,
) {
  return Boolean(
    enterpriseVerification && !enterpriseVerification.rejectionReason,
  );
}

export function getOccupiedInvoiceOrderIds(
  invoices: InvoiceItem[],
  invoiceDetails: Record<string, InvoiceApplicationDetails>,
) {
  const occupiedOrderIds = invoices.flatMap(item => {
    if (item.statusText === '待提交' || item.statusText === '已驳回') {
      return [];
    }

    return invoiceDetails[item.id]?.selectedOrderIds ?? [];
  });

  return Array.from(new Set(occupiedOrderIds));
}

export function getAvailableInvoiceableOrders<
  T extends ProfileInvoiceableOrderItem,
>(invoiceableOrders: T[], occupiedInvoiceOrderIds: string[]) {
  const occupiedOrderIdSet = new Set(occupiedInvoiceOrderIds);

  return invoiceableOrders.filter(item => !occupiedOrderIdSet.has(item.id));
}

export function getSelectedInvoiceSummary<T extends ProfileInvoiceableOrderItem>(
  invoiceableOrders: T[],
  selectedInvoiceOrderIds: string[],
) {
  const selectedOrders = invoiceableOrders.filter(item =>
    selectedInvoiceOrderIds.includes(item.id),
  );

  return {
    selectedOrders,
    selectedAmount: selectedOrders.reduce(
      (total, item) => total + item.amountValue,
      0,
    ),
    selectedOrderText: selectedOrders.map(item => item.orderId).join('、'),
  };
}

export function getNextInvoiceOrderSelection(
  selectedInvoiceOrderIds: string[],
  orderId: string,
) {
  const alreadySelected = selectedInvoiceOrderIds.includes(orderId);

  if (alreadySelected && selectedInvoiceOrderIds.length === 1) {
    return {
      selectedInvoiceOrderIds,
      notice: '至少选择一笔可开票订单',
    };
  }

  return {
    selectedInvoiceOrderIds: alreadySelected
      ? selectedInvoiceOrderIds.filter(selectedOrderId => selectedOrderId !== orderId)
      : [...selectedInvoiceOrderIds, orderId],
    notice: '',
  };
}

export function validateInvoiceSubmission({
  receiverEmail,
  selectedOrderCount,
  invoiceType,
  invoiceTitle,
  canRequestVatSpecialInvoice: canRequestVatSpecial,
  canUseEnterpriseInvoiceTitle,
}: {
  receiverEmail: string;
  selectedOrderCount: number;
  invoiceType: InvoiceTypeOption;
  invoiceTitle: InvoiceTitleOption;
  canRequestVatSpecialInvoice: boolean;
  canUseEnterpriseInvoiceTitle: boolean;
}) {
  const trimmedEmail = receiverEmail.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return {
      trimmedEmail,
      notice: '请填写有效接收邮箱',
    };
  }

  if (selectedOrderCount === 0) {
    return {
      trimmedEmail,
      notice: '请选择开票订单',
    };
  }

  if (invoiceType === 'vat-special' && !canRequestVatSpecial) {
    return {
      trimmedEmail,
      notice: '增值税专用发票需先提交企业认证资料',
    };
  }

  if (invoiceTitle === 'enterprise' && !canUseEnterpriseInvoiceTitle) {
    return {
      trimmedEmail,
      notice: '企业抬头需先提交企业认证资料',
    };
  }

  return {
    trimmedEmail,
    notice: '',
  };
}

export function getInvoiceTypeText(invoiceType: InvoiceTypeOption) {
  return (
    invoiceTypeOptions.find(option => option.id === invoiceType)?.label ??
    '电子普通发票'
  );
}

export function createPlatformInvoiceOrderSelectionId(orderId: string) {
  return `invoice-order-platform-${orderId}`;
}

export function isPlatformInvoiceApplicationSnapshot(
  value: unknown,
): value is PlatformInvoiceApplicationSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PlatformInvoiceApplicationSnapshot).id === 'string' &&
    ((value as PlatformInvoiceApplicationSnapshot).invoiceType === 'normal' ||
      (value as PlatformInvoiceApplicationSnapshot).invoiceType ===
        'vat-special') &&
    ((value as PlatformInvoiceApplicationSnapshot).invoiceTitleType ===
      'personal' ||
      (value as PlatformInvoiceApplicationSnapshot).invoiceTitleType ===
        'enterprise') &&
    typeof (value as PlatformInvoiceApplicationSnapshot).invoiceTitle ===
      'string' &&
    typeof (value as PlatformInvoiceApplicationSnapshot).receiverEmail ===
      'string' &&
    Array.isArray((value as PlatformInvoiceApplicationSnapshot).orderIds) &&
    (value as PlatformInvoiceApplicationSnapshot).orderIds.every(
      item => typeof item === 'string',
    ) &&
    Array.isArray((value as PlatformInvoiceApplicationSnapshot).orderNos) &&
    (value as PlatformInvoiceApplicationSnapshot).orderNos.every(
      item => typeof item === 'string',
    ) &&
    typeof (value as PlatformInvoiceApplicationSnapshot).amountCents ===
      'number' &&
    ((value as PlatformInvoiceApplicationSnapshot).status === 'reviewing' ||
      (value as PlatformInvoiceApplicationSnapshot).status === 'approved' ||
      (value as PlatformInvoiceApplicationSnapshot).status === 'rejected') &&
    typeof (value as PlatformInvoiceApplicationSnapshot).createdAtIso ===
      'string' &&
    typeof (value as PlatformInvoiceApplicationSnapshot).updatedAtIso ===
      'string'
  );
}

export function getInvoiceTitleText({
  invoiceTitle,
  currentInvoiceTitle,
  accountDisplayName,
  enterpriseVerification,
}: {
  invoiceTitle: InvoiceTitleOption;
  currentInvoiceTitle: string;
  accountDisplayName: string;
  enterpriseVerification?: EnterpriseVerificationRequest;
}) {
  const trimmedAccountDisplayName = accountDisplayName.trim();
  const trimmedCurrentInvoiceTitle = currentInvoiceTitle.trim();

  if (invoiceTitle === 'enterprise') {
    return enterpriseVerification && !enterpriseVerification.rejectionReason
      ? enterpriseVerification.enterpriseName
      : trimmedCurrentInvoiceTitle || trimmedAccountDisplayName || '个人货主';
  }

  return trimmedAccountDisplayName || '个人货主';
}

export function createLocalInvoiceStateFromPlatformApplications(
  applications: PlatformInvoiceApplicationSnapshot[],
) {
  const sortedApplications = [...applications].sort((left, right) =>
    right.createdAtIso.localeCompare(left.createdAtIso),
  );
  const invoices: InvoiceItem[] = [];
  const invoiceDetails: Record<string, InvoiceApplicationDetails> = {};
  const invoiceRejectionReasons: InvoiceRejectionReasons = {};

  sortedApplications.forEach(application => {
    const invoiceAmountText = formatPlatformInvoiceAmount(
      application.amountCents,
    );
    const submittedAtText = formatPlatformInvoiceDateTime(
      application.createdAtIso,
    );
    const updatedAtText = formatPlatformInvoiceDateTime(
      application.updatedAtIso,
    );
    const selectedOrderText =
      application.orderNos.length > 0
        ? application.orderNos.join('、')
        : application.orderIds.join('、');

    invoices.push({
      id: application.id,
      title: application.invoiceTitle,
      typeText: getInvoiceTypeText(application.invoiceType),
      amountText: `${
        application.status === 'approved' ? '已开票' : '待开票'
      } ${invoiceAmountText}`,
      statusText: getPlatformInvoiceStatusText(application.status),
    });

    invoiceDetails[application.id] = {
      invoiceTypeText: getInvoiceTypeText(application.invoiceType),
      invoiceTitleText: application.invoiceTitle,
      receiverEmail: application.receiverEmail,
      selectedOrderIds: application.orderIds.map(
        createPlatformInvoiceOrderSelectionId,
      ),
      selectedOrderText,
      invoiceAmountText,
      platformSynced: true,
      submittedAtText,
      submittedAtIso: application.createdAtIso,
      ...(application.status === 'approved'
        ? {
            approvedAtText: updatedAtText,
            approvedAtIso: application.updatedAtIso,
          }
        : {}),
      ...(application.status === 'rejected'
        ? {
            rejectedAtText: updatedAtText,
            rejectedAtIso: application.updatedAtIso,
          }
        : {}),
      statusHistory: createPlatformInvoiceStatusHistory(application),
      historyEntries: [
        {
          entryId: `${application.id}-history-1`,
          sequenceNumber: 1,
          titleText: application.invoiceTitle,
          typeText: getInvoiceTypeText(application.invoiceType),
          amountText: invoiceAmountText,
          orderText: selectedOrderText,
          submittedAtText,
          submittedAtIso: application.createdAtIso,
          receiverEmail: application.receiverEmail,
          statusText: getPlatformInvoiceStatusText(application.status),
          ...(application.status === 'approved'
            ? {
                approvedAtText: updatedAtText,
                approvedAtIso: application.updatedAtIso,
              }
            : {}),
          ...(application.status === 'rejected'
            ? {
                rejectionReasonText: application.rejectionReason,
                rejectedAtIso: application.updatedAtIso,
              }
            : {}),
        },
      ],
    };

    if (application.rejectionReason) {
      invoiceRejectionReasons[application.id] = application.rejectionReason;
    }
  });

  const latestApplication = sortedApplications[0];

  return {
    invoices,
    invoiceDetails,
    invoiceRejectionReasons,
    ...(latestApplication
      ? {
          invoiceType: latestApplication.invoiceType,
          invoiceTitle: latestApplication.invoiceTitleType,
          receiverEmail: latestApplication.receiverEmail,
        }
      : {}),
  };
}

export function appendInvoiceHistory(
  currentHistory: InvoiceStatusHistoryItem[] | undefined,
  historyItem: InvoiceStatusHistoryItem,
) {
  return [...(currentHistory ?? []), historyItem];
}

export function createInvoiceHistoryEntry({
  invoiceId,
  sequenceNumber,
  titleText,
  typeText,
  amountText,
  orderText,
  submittedAtText,
  submittedAtIso,
  receiverEmail,
}: {
  invoiceId: string;
  sequenceNumber: number;
  titleText: string;
  typeText: string;
  amountText: string;
  orderText: string;
  submittedAtText: string;
  submittedAtIso?: string;
  receiverEmail: string;
}): InvoiceHistoryEntry {
  return {
    entryId: `${invoiceId}-history-${sequenceNumber}`,
    sequenceNumber,
    titleText,
    typeText,
    amountText,
    orderText,
    submittedAtText,
    submittedAtIso,
    receiverEmail,
    statusText: '申请中',
  };
}

export function updateLatestInvoiceHistoryEntry(
  historyEntries: InvoiceHistoryEntry[] | undefined,
  updater: (currentEntry: InvoiceHistoryEntry) => InvoiceHistoryEntry,
) {
  if (!historyEntries?.length) {
    return historyEntries ?? [];
  }

  const nextEntries = [...historyEntries];
  const lastIndex = nextEntries.length - 1;

  nextEntries[lastIndex] = updater(nextEntries[lastIndex]);

  return nextEntries;
}

export function createSubmittedInvoiceChanges({
  invoiceId,
  invoices,
  invoiceDetails,
  invoiceRejectionReasons,
  selectedOrders,
  selectedInvoiceOrderIds,
  invoiceTypeText,
  invoiceTitleText,
  receiverEmail,
  selectedOrderText,
  invoiceAmountText,
  currentTimeText,
  currentTimeIso,
}: {
  invoiceId: string;
  invoices: InvoiceItem[];
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  invoiceRejectionReasons: InvoiceRejectionReasons;
  selectedOrders: ProfileInvoiceableOrderItem[];
  selectedInvoiceOrderIds: string[];
  invoiceTypeText: string;
  invoiceTitleText: string;
  receiverEmail: string;
  selectedOrderText: string;
  invoiceAmountText: string;
  currentTimeText: string;
  currentTimeIso?: string;
}) {
  const targetInvoice = invoices.find(item => item.id === invoiceId);

  if (!targetInvoice) {
    return undefined;
  }

  const currentDetails = invoiceDetails[invoiceId];
  const nextRejectionReasons = {...invoiceRejectionReasons};
  const selectedOrderIdSet = new Set(selectedOrders.map(item => item.id));

  delete nextRejectionReasons[invoiceId];

  return {
    invoices: invoices.map(item =>
      item.id === invoiceId
        ? {
            ...item,
            title: invoiceTitleText,
            statusText: '申请中',
            typeText: invoiceTypeText,
            amountText: `待开票 ${invoiceAmountText}`,
          }
        : item,
    ),
    invoiceRejectionReasons: nextRejectionReasons,
    invoiceDetails: {
      ...invoiceDetails,
      [invoiceId]: {
        invoiceTypeText,
        invoiceTitleText,
        receiverEmail,
        selectedOrderIds: selectedOrders.map(item => item.id),
        selectedOrderText,
        invoiceAmountText,
        submittedAtText: currentTimeText,
        submittedAtIso: currentTimeIso,
        approvedAtText: undefined,
        approvedAtIso: undefined,
        rejectedAtText: undefined,
        rejectedAtIso: undefined,
        downloadedAtText: undefined,
        downloadedAtIso: undefined,
        statusHistory: appendInvoiceHistory(currentDetails?.statusHistory, {
          actionText:
            targetInvoice.statusText === '已驳回' ? '重新提交' : '申请提交',
          timestampText: currentTimeText,
          timestampIso: currentTimeIso,
        }),
        historyEntries: [
          ...(currentDetails?.historyEntries ?? []),
          createInvoiceHistoryEntry({
            invoiceId,
            sequenceNumber: (currentDetails?.historyEntries?.length ?? 0) + 1,
            titleText: invoiceTitleText,
            typeText: invoiceTypeText,
            amountText: invoiceAmountText,
            orderText: selectedOrderText,
            submittedAtText: currentTimeText,
            submittedAtIso: currentTimeIso,
            receiverEmail,
          }),
        ],
      },
    },
    selectedInvoiceOrderIds: selectedInvoiceOrderIds.filter(
      orderId => !selectedOrderIdSet.has(orderId),
    ),
  };
}

export function createApprovedInvoiceChanges({
  invoiceId,
  invoices,
  invoiceDetails,
  currentTimeText,
  currentTimeIso,
}: {
  invoiceId: string;
  invoices: InvoiceItem[];
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  currentTimeText: string;
  currentTimeIso?: string;
}) {
  const currentDetails = invoiceDetails[invoiceId];
  const invoiceAmountText = currentDetails?.invoiceAmountText;

  return {
    invoices: invoices.map(item =>
      item.id === invoiceId
        ? {
            ...item,
            statusText: '已开票',
            amountText: invoiceAmountText
              ? `已开票 ${invoiceAmountText}`
              : item.amountText,
          }
        : item,
    ),
    invoiceDetails: currentDetails
      ? {
          ...invoiceDetails,
          [invoiceId]: {
            ...currentDetails,
            approvedAtText: currentTimeText,
            approvedAtIso: currentTimeIso,
            statusHistory: appendInvoiceHistory(currentDetails.statusHistory, {
              actionText: '审核通过',
              timestampText: currentTimeText,
              timestampIso: currentTimeIso,
            }),
            historyEntries: updateLatestInvoiceHistoryEntry(
              currentDetails.historyEntries,
              currentEntry => ({
                ...currentEntry,
                statusText: '已开票',
                approvedAtText: currentTimeText,
                approvedAtIso: currentTimeIso,
              }),
            ),
          },
        }
      : invoiceDetails,
  };
}

export function createRejectedInvoiceChanges({
  invoiceId,
  invoices,
  invoiceDetails,
  invoiceRejectionReasons,
  rejectionReason,
  currentTimeText,
  currentTimeIso,
}: {
  invoiceId: string;
  invoices: InvoiceItem[];
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  invoiceRejectionReasons: InvoiceRejectionReasons;
  rejectionReason: string;
  currentTimeText: string;
  currentTimeIso?: string;
}) {
  const currentDetails = invoiceDetails[invoiceId];

  return {
    invoices: invoices.map(item =>
      item.id === invoiceId ? {...item, statusText: '已驳回'} : item,
    ),
    invoiceRejectionReasons: {
      ...invoiceRejectionReasons,
      [invoiceId]: rejectionReason,
    },
    invoiceDetails: currentDetails
      ? {
          ...invoiceDetails,
          [invoiceId]: {
            ...currentDetails,
            rejectedAtText: currentTimeText,
            rejectedAtIso: currentTimeIso,
            approvedAtText: undefined,
            approvedAtIso: undefined,
            downloadedAtText: undefined,
            downloadedAtIso: undefined,
            statusHistory: appendInvoiceHistory(currentDetails.statusHistory, {
              actionText: '审核驳回',
              timestampText: currentTimeText,
              timestampIso: currentTimeIso,
              noteText: `驳回说明：${rejectionReason}`,
            }),
            historyEntries: updateLatestInvoiceHistoryEntry(
              currentDetails.historyEntries,
              currentEntry => ({
                ...currentEntry,
                statusText: '已驳回',
                rejectionReasonText: rejectionReason,
                rejectedAtIso: currentTimeIso,
                approvedAtText: undefined,
                approvedAtIso: undefined,
                downloadedAtText: undefined,
                downloadedAtIso: undefined,
              }),
            ),
          },
        }
      : invoiceDetails,
  };
}

export function createDownloadedInvoiceDetails({
  invoiceId,
  invoiceDetails,
  currentTimeText,
  currentTimeIso,
}: {
  invoiceId: string;
  invoiceDetails: Record<string, InvoiceApplicationDetails>;
  currentTimeText: string;
  currentTimeIso?: string;
}) {
  const currentDetails = invoiceDetails[invoiceId];

  if (!currentDetails) {
    return invoiceDetails;
  }

  return {
    ...invoiceDetails,
    [invoiceId]: {
      ...currentDetails,
      downloadedAtText: currentTimeText,
      downloadedAtIso: currentTimeIso,
      statusHistory: appendInvoiceHistory(currentDetails.statusHistory, {
        actionText: '已下载凭证',
        timestampText: currentTimeText,
        timestampIso: currentTimeIso,
      }),
      historyEntries: updateLatestInvoiceHistoryEntry(
        currentDetails.historyEntries,
        currentEntry => ({
          ...currentEntry,
          downloadedAtText: currentTimeText,
          downloadedAtIso: currentTimeIso,
        }),
      ),
    },
  };
}

function getPlatformInvoiceStatusText(
  status: PlatformInvoiceApplicationSnapshot['status'],
): InvoiceItem['statusText'] {
  const statusTextMap = {
    reviewing: '申请中',
    approved: '已开票',
    rejected: '已驳回',
  } as const;

  return statusTextMap[status];
}

function createPlatformInvoiceStatusHistory(
  application: PlatformInvoiceApplicationSnapshot,
) {
  const submittedAtText = formatPlatformInvoiceDateTime(
    application.createdAtIso,
  );
  const updatedAtText = formatPlatformInvoiceDateTime(application.updatedAtIso);

  if (application.status === 'approved') {
    return [
      {
        actionText: '申请提交',
        timestampText: submittedAtText,
        timestampIso: application.createdAtIso,
      },
      {
        actionText: '审核通过',
        timestampText: updatedAtText,
        timestampIso: application.updatedAtIso,
      },
    ];
  }

  if (application.status === 'rejected') {
    return [
      {
        actionText: '申请提交',
        timestampText: submittedAtText,
        timestampIso: application.createdAtIso,
      },
      {
        actionText: '审核驳回',
        timestampText: updatedAtText,
        timestampIso: application.updatedAtIso,
        ...(application.rejectionReason
          ? { noteText: `驳回说明：${application.rejectionReason}` }
          : {}),
      },
    ];
  }

  return [
    {
      actionText: '申请提交',
      timestampText: submittedAtText,
      timestampIso: application.createdAtIso,
    },
  ];
}

function formatPlatformInvoiceAmount(amountCents: number) {
  const amount = amountCents / 100;

  return Number.isInteger(amount) ? `￥${amount}` : `￥${amount.toFixed(2)}`;
}

function formatPlatformInvoiceDateTime(timestampIso: string) {
  const timestamp = Date.parse(timestampIso);

  if (Number.isNaN(timestamp)) {
    return timestampIso;
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
