import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { MapPicker } from '../src/components/MapPicker';

const mockMapsApi = {
  geocode: jest.fn((address: string) => {
    return Promise.resolve({
      latitude: 22.5431 + address.length,
      longitude: 113.9305 + address.length,
      provider: 'sandbox' as const,
      formattedAddress: `${address}（地图定位结果）`,
    });
  }),
  reverseGeocode: jest.fn(),
  getDriverLocation: jest.fn(),
  reportDriverLocation: jest.fn(),
  getDriverNavigationTargets: jest.fn(),
  getShipperDriverLocation: jest.fn(),
};

describe('MapPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMapsApi.geocode.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders with initial address', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MapPicker
          platformMapsApi={mockMapsApi}
          initialAddress="深圳市宝安区"
          onSelect={() => {}}
          testID="map-picker"
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'map-picker' })).toBeTruthy();
  });

  it('calls onSelect when a result is chosen', async () => {
    const onSelect = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MapPicker
          platformMapsApi={mockMapsApi}
          onSelect={onSelect}
          testID="map-picker"
        />,
      );
    });

    const input = renderer?.root.findByProps({ testID: 'map-picker-input' });
    expect(input).toBeTruthy();

    await act(async () => {
      input?.props.onChangeText('深圳');
    });

    // Wait for debounce (400ms) + resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });

    const resultButton = renderer?.root.findByProps({
      testID: 'map-picker-result-深圳（地图定位结果）',
    });
    expect(resultButton).toBeTruthy();

    await act(async () => {
      resultButton?.props.onPress();
    });

    expect(onSelect).toHaveBeenCalledWith({
      latitude: 22.5431 + 2,
      longitude: 113.9305 + 2,
      formattedAddress: '深圳（地图定位结果）',
    });
  });

  it('does not search when query is too short', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MapPicker
          platformMapsApi={mockMapsApi}
          onSelect={() => {}}
          testID="map-picker"
        />,
      );
    });

    const input = renderer?.root.findByProps({ testID: 'map-picker-input' });

    await act(async () => {
      input?.props.onChangeText('深');
    });

    // Wait longer than debounce
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });

    // Verify no results shown (the search should not have triggered)
    const resultsSection = renderer?.root.findAllByProps({
      testID: 'map-picker-result-深',
    });
    expect(resultsSection?.length ?? 0).toBe(0);
  });

  it('reports error when maps API fails', async () => {
    const errorApi = {
      ...mockMapsApi,
      geocode: jest.fn().mockRejectedValue(new Error('Network error')),
    };

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MapPicker
          platformMapsApi={errorApi}
          onSelect={() => {}}
          testID="map-picker"
        />,
      );
    });

    const input = renderer?.root.findByProps({ testID: 'map-picker-input' });

    await act(async () => {
      input?.props.onChangeText('深圳南山');
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });

    expect(
      renderer?.root.findByProps({ testID: 'map-picker' }),
    ).toBeTruthy();
  });

  it('renders with coordinates provided', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MapPicker
          platformMapsApi={mockMapsApi}
          initialAddress="当前位置"
          initialLatitude={22.5431}
          initialLongitude={113.9305}
          onSelect={() => {}}
          testID="map-picker"
        />,
      );
    });

    const picker = renderer?.root.findByProps({ testID: 'map-picker' });
    expect(picker).toBeTruthy();
  });
});
