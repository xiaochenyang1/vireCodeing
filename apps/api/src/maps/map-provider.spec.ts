import { haversineDistanceMeters } from './map-provider';
import { SandboxMapProvider } from './sandbox-map.provider';

describe('sandbox map provider', () => {
  const provider = new SandboxMapProvider();

  it('returns deterministic coordinates for the same address', async () => {
    const first = await provider.geocode('  宝安区福永物流园  ');
    const second = await provider.geocode('宝安区福永物流园');

    expect(first).toEqual(second);
    expect(first.provider).toBe('sandbox');
    expect(first.latitude).toBeGreaterThanOrEqual(22.45);
    expect(first.latitude).toBeLessThanOrEqual(22.85);
    expect(first.longitude).toBeGreaterThanOrEqual(113.8);
    expect(first.longitude).toBeLessThanOrEqual(114.4);
  });

  it('returns different coordinates for different addresses', async () => {
    const pickup = await provider.geocode('宝安区福永物流园');
    const delivery = await provider.geocode('龙岗区平湖物流园');

    expect(pickup).not.toEqual(delivery);
  });

  it('estimates distance with haversine meters', () => {
    const meters = haversineDistanceMeters(
      { latitude: 22.54, longitude: 114.05 },
      { latitude: 22.55, longitude: 114.06 },
    );

    expect(meters).toBeGreaterThan(1000);
    expect(meters).toBeLessThan(2000);
    expect(provider.estimateDistanceMeters(
      { latitude: 22.54, longitude: 114.05 },
      { latitude: 22.55, longitude: 114.06 },
    )).toBe(meters);
  });
});
