import { ApiErrorCode } from '../common/errors';
import { AmapMapProvider } from './amap-map.provider';
import { createMapProviderFromEnv } from './maps.module';

describe('AmapMapProvider', () => {
  it('geocodes an address through the Amap web service', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '1',
        geocodes: [
          {
            location: '113.910000,22.610000',
            formatted_address: '广东省深圳市宝安区福永物流园',
          },
        ],
      }),
    });

    const provider = new AmapMapProvider({
      webKey: 'amap-web-key-123456',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.geocode('宝安区福永物流园')).resolves.toEqual({
      latitude: 22.61,
      longitude: 113.91,
      provider: 'amap',
      formattedAddress: '广东省深圳市宝安区福永物流园',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/v3/geocode/geo?'),
      expect.objectContaining({ method: 'GET' }),
    );
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toContain('key=amap-web-key-123456');
    expect(calledUrl).toContain(encodeURIComponent('宝安区福永物流园'));
  });

  it('reverse geocodes coordinates through the Amap web service', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '1',
        regeocode: {
          formatted_address: '广东省深圳市宝安区',
        },
      }),
    });

    const provider = new AmapMapProvider({
      webKey: 'amap-web-key-123456',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      provider.reverseGeocode({ latitude: 22.61, longitude: 113.91 }),
    ).resolves.toMatchObject({
      provider: 'amap',
      formattedAddress: '广东省深圳市宝安区',
      latitude: 22.61,
      longitude: 113.91,
    });
  });

  it('maps empty geocode results to MAP_ADDRESS_INVALID', async () => {
    const provider = new AmapMapProvider({
      webKey: 'amap-web-key-123456',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: '1',
          geocodes: [],
        }),
      }) as unknown as typeof fetch,
    });

    await expect(provider.geocode('不存在的地址')).rejects.toMatchObject({
      code: ApiErrorCode.MAP_ADDRESS_INVALID,
    });
  });

  it('maps upstream failures to MAP_PROVIDER_UNAVAILABLE', async () => {
    const provider = new AmapMapProvider({
      webKey: 'amap-web-key-123456',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: '0',
          info: 'INVALID_USER_KEY',
        }),
      }) as unknown as typeof fetch,
    });

    await expect(provider.geocode('宝安区福永物流园')).rejects.toMatchObject({
      code: ApiErrorCode.MAP_PROVIDER_UNAVAILABLE,
    });
  });

  it('selects sandbox or amap providers from env', () => {
    expect(createMapProviderFromEnv({}).name).toBe('sandbox');
    expect(
      createMapProviderFromEnv({
        MAP_PROVIDER: 'amap',
        AMAP_WEB_KEY: 'amap-web-key-123456',
      }).name,
    ).toBe('amap');
    expect(() =>
      createMapProviderFromEnv({
        MAP_PROVIDER: 'amap',
      }),
    ).toThrow('AMAP_WEB_KEY is required');
  });
});
