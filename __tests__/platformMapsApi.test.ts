import { createPlatformMapsApi } from '../src/services/platformMapsApi';
import { PlatformApiError } from '../src/services/platformApiClient';
import {
  buildExternalNavigationUrls,
  formatCoordinateText,
} from '../src/utils/mapsNavigation';

describe('platform maps api', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('geocodes an address with a trimmed body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        latitude: 22.6,
        longitude: 113.9,
        provider: 'sandbox',
        formattedAddress: '宝安区福永物流园',
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformMapsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.geocode('  宝安区福永物流园  ')).resolves.toMatchObject({
      provider: 'sandbox',
      latitude: 22.6,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/maps/geocode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address: '宝安区福永物流园' }),
      }),
    );
  });

  it('rejects blank addresses before sending', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformMapsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(api.geocode(' ')).rejects.toBeInstanceOf(PlatformApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reverse geocodes coordinates', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createJsonResponse({
        latitude: 22.61,
        longitude: 113.91,
        provider: 'sandbox',
        formattedAddress: '沙箱坐标 22.610000,113.910000',
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = createPlatformMapsApi({
      baseUrl: 'http://localhost:3000/api',
      getAccessToken: () => 'access-token',
    });

    await expect(
      api.reverseGeocode({ latitude: 22.61, longitude: 113.91 }),
    ).resolves.toMatchObject({
      provider: 'sandbox',
      formattedAddress: '沙箱坐标 22.610000,113.910000',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/maps/reverse-geocode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ latitude: 22.61, longitude: 113.91 }),
      }),
    );
  });
});

describe('maps navigation utils', () => {
  it('builds coordinate deep links when lat/lng exist', () => {
    expect(
      buildExternalNavigationUrls({
        label: '装货点',
        address: '宝安区福永物流园',
        latitude: 22.6,
        longitude: 113.9,
      }),
    ).toMatchObject({
      geo: expect.stringContaining('geo:22.6,113.9'),
      appleMaps: expect.stringContaining('daddr=22.6,113.9'),
      amapAndroid: expect.stringContaining('lat=22.6&lon=113.9'),
    });
    expect(formatCoordinateText(22.6, 113.9)).toBe('22.600000, 113.900000');
  });

  it('falls back to address query when coordinates are missing', () => {
    expect(
      buildExternalNavigationUrls({
        label: '卸货点',
        address: '龙岗区坂田仓',
      }).geo,
    ).toContain('q=%E9%BE%99%E5%B2%97%E5%8C%BA%E5%9D%82%E7%94%B0%E4%BB%93');
  });
});

function createJsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({
      code: 'OK',
      message: 'success',
      data,
      requestId: 'req_test',
      timestamp: '2026-07-21T08:00:00.000Z',
    }),
  };
}
