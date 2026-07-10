export type ShipperFrequentRoute = {
  id: string;
  name: string;
  from: string;
  to: string;
  lastUsedText: string;
  lastUsedIso?: string;
};

export type SaveShipperProfileFrequentRoutesRequest = {
  routes: ShipperFrequentRoute[];
  clientUpdatedAtIso?: string;
  baseUpdatedAtIso?: string;
};

export type ShipperProfileFrequentRoutesRecord =
  SaveShipperProfileFrequentRoutesRequest & {
    shipperId: string;
    updatedAtIso: string;
  };
