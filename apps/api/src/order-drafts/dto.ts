export type ShipperOrderDraftSnapshot = Record<string, unknown>;

export type SaveShipperOrderDraftRequest = {
  draftSnapshot: ShipperOrderDraftSnapshot;
  clientUpdatedAtIso?: string;
  baseUpdatedAtIso?: string;
};

export type ShipperOrderDraftRecord = {
  shipperId: string;
  draftSnapshot: ShipperOrderDraftSnapshot;
  clientUpdatedAtIso?: string;
  updatedAtIso: string;
};
