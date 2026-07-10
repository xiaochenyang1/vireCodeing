import type {
  SaveShipperOrderDraftRequest,
  ShipperOrderDraftRecord,
  ShipperOrderDraftSnapshot,
} from './dto';

export interface OrderDraftsRepository {
  findDraftByShipperId(
    shipperId: string,
  ): Promise<ShipperOrderDraftRecord | undefined>;
  saveDraft(
    shipperId: string,
    input: SaveShipperOrderDraftRequest,
  ): Promise<ShipperOrderDraftRecord>;
}

export class InMemoryOrderDraftsRepository implements OrderDraftsRepository {
  private readonly drafts = new Map<string, ShipperOrderDraftRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findDraftByShipperId(shipperId: string) {
    return this.drafts.get(shipperId);
  }

  async saveDraft(
    shipperId: string,
    input: SaveShipperOrderDraftRequest,
  ): Promise<ShipperOrderDraftRecord> {
    const draft: ShipperOrderDraftRecord = {
      shipperId,
      draftSnapshot: input.draftSnapshot,
      clientUpdatedAtIso: input.clientUpdatedAtIso,
      updatedAtIso: this.now().toISOString(),
    };

    this.drafts.set(shipperId, draft);

    return draft;
  }
}

export type PrismaOrderDraftRecord = {
  shipperId: string;
  draftSnapshot: unknown;
  clientUpdatedAt: Date | null;
  updatedAt: Date;
};

export type PrismaOrderDraftsClient = {
  orderDraft: {
    findUnique(args: {
      where: { shipperId: string };
    }): Promise<PrismaOrderDraftRecord | null>;
    upsert(args: {
      where: { shipperId: string };
      create: {
        shipperId: string;
        draftSnapshot: ShipperOrderDraftSnapshot;
        clientUpdatedAt?: Date;
      };
      update: {
        draftSnapshot: ShipperOrderDraftSnapshot;
        clientUpdatedAt: Date | null;
      };
    }): Promise<PrismaOrderDraftRecord>;
  };
};

export class PrismaOrderDraftsRepository implements OrderDraftsRepository {
  constructor(private readonly prisma: PrismaOrderDraftsClient) {}

  async findDraftByShipperId(shipperId: string) {
    const draft = await this.prisma.orderDraft.findUnique({
      where: { shipperId },
    });

    return draft ? mapPrismaOrderDraft(draft) : undefined;
  }

  async saveDraft(
    shipperId: string,
    input: SaveShipperOrderDraftRequest,
  ): Promise<ShipperOrderDraftRecord> {
    const clientUpdatedAt = input.clientUpdatedAtIso
      ? new Date(input.clientUpdatedAtIso)
      : undefined;
    const draft = await this.prisma.orderDraft.upsert({
      where: { shipperId },
      create: {
        shipperId,
        draftSnapshot: input.draftSnapshot,
        clientUpdatedAt,
      },
      update: {
        draftSnapshot: input.draftSnapshot,
        clientUpdatedAt: clientUpdatedAt ?? null,
      },
    });

    return mapPrismaOrderDraft(draft);
  }
}

function mapPrismaOrderDraft(
  draft: PrismaOrderDraftRecord,
): ShipperOrderDraftRecord {
  return {
    shipperId: draft.shipperId,
    draftSnapshot: toDraftSnapshot(draft.draftSnapshot),
    clientUpdatedAtIso: draft.clientUpdatedAt?.toISOString(),
    updatedAtIso: draft.updatedAt.toISOString(),
  };
}

function toDraftSnapshot(value: unknown): ShipperOrderDraftSnapshot {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as ShipperOrderDraftSnapshot;
  }

  return {};
}
