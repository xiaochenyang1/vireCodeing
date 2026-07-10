import {
  parseSaveShipperOrderDraftRequest,
  saveShipperOrderDraftSchema,
} from './order-drafts.validation';

describe('order draft validation', () => {
  it('parses a structured draft snapshot with optional client and base timestamps', () => {
    expect(
      parseSaveShipperOrderDraftRequest({
        draftSnapshot: {
          cargoType: 'digital',
          pickupAddress: '宝安临时仓',
        },
        clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
        baseUpdatedAtIso: '2026-07-02T09:00:00.000Z',
      }),
    ).toEqual({
      draftSnapshot: {
        cargoType: 'digital',
        pickupAddress: '宝安临时仓',
      },
      clientUpdatedAtIso: '2026-07-02T08:30:00.000Z',
      baseUpdatedAtIso: '2026-07-02T09:00:00.000Z',
    });
  });

  it('rejects non-object draft snapshots', () => {
    expect(() =>
      saveShipperOrderDraftSchema.parse({
        draftSnapshot: [],
      }),
    ).toThrow('草稿快照必须是对象');
  });

  it('rejects invalid client timestamps', () => {
    expect(() =>
      saveShipperOrderDraftSchema.parse({
        draftSnapshot: { cargoType: 'digital' },
        clientUpdatedAtIso: '不是时间',
      }),
    ).toThrow('草稿更新时间不合法');
  });

  it('rejects invalid base timestamps', () => {
    expect(() =>
      saveShipperOrderDraftSchema.parse({
        draftSnapshot: { cargoType: 'digital' },
        baseUpdatedAtIso: '不是时间',
      }),
    ).toThrow('草稿基线版本不合法');
  });
});
