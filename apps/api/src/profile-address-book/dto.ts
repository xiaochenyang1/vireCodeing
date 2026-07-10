export type ShipperProfileAddressBookAddress = {
  id: string;
  name: string;
  address: string;
  contactText: string;
  tagText?: string;
};

export type ShipperProfileAddressBookContact = {
  id: string;
  name: string;
  roleText: string;
  phoneText: string;
  noteText?: string;
};

export type SaveShipperProfileAddressBookRequest = {
  addresses: ShipperProfileAddressBookAddress[];
  contacts: ShipperProfileAddressBookContact[];
  clientUpdatedAtIso?: string;
  baseUpdatedAtIso?: string;
};

export type ShipperProfileAddressBookRecord =
  SaveShipperProfileAddressBookRequest & {
    shipperId: string;
    updatedAtIso: string;
  };
