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

export type AdminSupportTicketListQuery = {
  page: number;
  pageSize: number;
  status?: ShipperSupportTicketStatus;
  keyword?: string;
};

export type UpdateShipperSupportTicketRequest = {
  baseUpdatedAtIso: string;
  content: string;
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
