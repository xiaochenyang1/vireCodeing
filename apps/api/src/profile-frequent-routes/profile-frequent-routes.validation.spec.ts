import { ZodError } from 'zod';
import { parseSaveShipperProfileFrequentRoutesRequest } from './profile-frequent-routes.validation';

describe('profile frequent routes validation', () => {
  it('parses a shipper frequent routes snapshot', () => {
    expect(
      parseSaveShipperProfileFrequentRoutesRequest({
        routes: [
          {
            id: 'route-1',
            name: ' 宝安仓库 -> 南山门店 ',
            from: ' 宝安仓库 ',
            to: ' 南山门店 ',
            lastUsedText: '刚刚添加',
            lastUsedIso: '2026-07-04T08:00:00.000Z',
          },
        ],
        clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
        baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
      }),
    ).toEqual({
      routes: [
        {
          id: 'route-1',
          name: '宝安仓库 -> 南山门店',
          from: '宝安仓库',
          to: '南山门店',
          lastUsedText: '刚刚添加',
          lastUsedIso: '2026-07-04T08:00:00.000Z',
        },
      ],
      clientUpdatedAtIso: '2026-07-04T08:00:00.000Z',
      baseUpdatedAtIso: '2026-07-04T08:30:00.000Z',
    });
  });

  it('rejects an invalid frequent routes base version', () => {
    expect(() =>
      parseSaveShipperProfileFrequentRoutesRequest({
        routes: [],
        baseUpdatedAtIso: '不是时间',
      }),
    ).toThrow('常用路线基线版本不合法');
  });

  it('rejects too many shipper frequent routes', () => {
    expect(() =>
      parseSaveShipperProfileFrequentRoutesRequest({
        routes: Array.from({ length: 21 }, (_, index) => ({
          id: `route-${index}`,
          name: `路线 ${index}`,
          from: '宝安仓库',
          to: '南山门店',
          lastUsedText: '刚刚添加',
        })),
      }),
    ).toThrow(ZodError);
  });
});
