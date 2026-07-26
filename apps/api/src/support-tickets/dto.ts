export type ShipperSupportTicketStatus = 'pending' | 'processing' | 'resolved';

export type ShipperSupportTicketSlaPolicyKey =
  'support_ticket_default_v1';

export type ShipperSupportTicketSlaStage =
  | 'first_response'
  | 'resolution';

export type ShipperSupportTicketSlaStatus =
  | 'within_target'
  | 'overdue'
  | 'resolved_within_target'
  | 'resolved_overdue';

export type SupportTicketClaimStatus = 'claimed' | 'unclaimed';

export type ShipperSupportTicketSlaSnapshot = {
  policyKey: ShipperSupportTicketSlaPolicyKey;
  stage: ShipperSupportTicketSlaStage;
  status: ShipperSupportTicketSlaStatus;
  targetAtIso: string;
  remainingMinutes?: number;
  overdueMinutes?: number;
};

export type ShipperSupportTicketStatusHistoryItem = {
  actionText: string;
  timestampIso: string;
  fromStatus?: ShipperSupportTicketStatus;
  toStatus?: ShipperSupportTicketStatus;
  operatorUserId?: string;
  content?: string;
};

export type CreateShipperSupportTicketRequest = {
  channelName: string;
  description: string;
};

export type AdminSupportTicketMatchQuery = {
  status?: ShipperSupportTicketStatus;
  keyword?: string;
};

export type AdminSupportTicketListQuery = AdminSupportTicketMatchQuery & {
  page: number;
  pageSize: number;
  slaStatus?: ShipperSupportTicketSlaStatus;
  claimStatus?: SupportTicketClaimStatus;
  claimedByAdminUserId?: string;
};

export type UpdateShipperSupportTicketRequest = {
  baseUpdatedAtIso: string;
  content: string;
};

export type ClaimSupportTicketRequest = {
  baseUpdatedAtIso: string;
  content?: string;
};

export type AssignSupportTicketRequest = {
  baseUpdatedAtIso: string;
  targetAdminUserId: string;
  content?: string;
};

export type SupportTicketOverdueEscalationSweepTrigger =
  | 'admin'
  | 'scheduler';

export type SupportTicketOverdueEscalationSweepResult = {
  trigger: SupportTicketOverdueEscalationSweepTrigger;
  triggeredAtIso: string;
  scannedCount: number;
  overdueCount: number;
  escalatedCount: number;
  skippedCount: number;
  conflictCount: number;
  escalatedTicketIds: string[];
};

export type CreateShipperSupportTicketRecordInput =
  CreateShipperSupportTicketRequest & {
    status: ShipperSupportTicketStatus;
    statusHistory: ShipperSupportTicketStatusHistoryItem[];
    createdAtIso: string;
    updatedAtIso: string;
  };

export type TransitionShipperSupportTicketRecordInput =
  UpdateShipperSupportTicketRequest & {
    actionText: string;
    updatedAtIso: string;
  };

export type ShipperSupportTicketRecord = CreateShipperSupportTicketRequest & {
  id: string;
  shipperId: string;
  status: ShipperSupportTicketStatus;
  statusHistory: ShipperSupportTicketStatusHistoryItem[];
  claimedByAdminUserId?: string;
  claimedAtIso?: string;
  claimNote?: string;
  sla?: ShipperSupportTicketSlaSnapshot;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ShipperSupportTicketListRecord = {
  shipperId: string;
  items: ShipperSupportTicketRecord[];
};

export type AdminSupportTicketListRecord = {
  items: ShipperSupportTicketRecord[];
  page: number;
  pageSize: number;
  total: number;
};
