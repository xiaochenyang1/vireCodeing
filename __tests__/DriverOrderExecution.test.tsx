import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { DriverOrderExecution } from '../src/components/DriverOrderExecution';

function createMockOrder(status: string = 'loading') {
  return {
    id: 'order-1',
    platformOrderId: 'platform-order-1',
    orderNo: 'HY202607090001',
    status,
    cargoType: '建材',
    weightText: '5 吨',
    quantityText: '10 件',
    volumeText: '20 立方米',
    cargoDescription: '水泥和钢筋',
    pickupContact: '赵经理',
    pickupPhone: '13800138001',
    deliveryContact: '钱店长',
    deliveryPhone: '13900139001',
    updatedAtIso: '2026-07-09T02:00:00.000Z',
    createdAtIso: '2026-07-09T01:00:00.000Z',
  };
}

function createMockNavigationTargets() {
  return [
    { type: 'pickup' as const, address: '宝安区福永物流园', contactName: '赵经理', contactPhone: '13800138001' },
    { type: 'delivery' as const, address: '龙岗区坂田仓', contactName: '钱店长', contactPhone: '13900139001' },
  ];
}

describe('DriverOrderExecution', () => {
  it('renders loading stage with advance button', async () => {
    const order = createMockOrder('loading');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-order-execution' })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: 'driver-advance-order-1' })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: 'driver-advance-order-1' }).props.children).toBe('确认装货完成');
  });

  it('renders transporting stage with advance button', async () => {
    const order = createMockOrder('transporting');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-advance-order-1' }).props.children).toBe('确认卸货完成');
  });

  it('renders confirming stage with advance button', async () => {
    const order = createMockOrder('confirming');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-advance-order-1' }).props.children).toBe('确认送达');
  });

  it('renders completed stage without advance button', async () => {
    const order = createMockOrder('completed');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={createMockNavigationTargets()}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(() =>
      renderer?.root.findByProps({ testID: 'driver-advance-order-1' }),
    ).toThrow();
  });

  it('shows receipt upload fields for loading stage', async () => {
    const order = createMockOrder('loading');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
          platformFileApi={{
            createUploadIntent: async () => ({ id: 'intent-1', uploadUrl: 'https://example.com/upload' }),
            confirmUploaded: async () => ({ id: 'file-1', status: 'uploaded' }),
          }}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-receipt-loading-order-1' })).toBeTruthy();
  });

  it('shows receipt upload fields for transporting stage', async () => {
    const order = createMockOrder('transporting');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
          platformFileApi={{
            createUploadIntent: async () => ({ id: 'intent-1', uploadUrl: 'https://example.com/upload' }),
            confirmUploaded: async () => ({ id: 'file-1', status: 'uploaded' }),
          }}
        />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'driver-receipt-confirming-order-1' })).toBeTruthy();
  });

  it('does not show receipt upload fields for confirming stage', async () => {
    const order = createMockOrder('confirming');

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={() => {}}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    expect(() =>
      renderer?.root.findByProps({ testID: 'driver-receipt-loading-order-1' }),
    ).toThrow();
    expect(() =>
      renderer?.root.findByProps({ testID: 'driver-receipt-confirming-order-1' }),
    ).toThrow();
  });

  it('calls onAdvanceStatus when advance button is pressed', async () => {
    const order = createMockOrder('loading');
    const onAdvance = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DriverOrderExecution
          order={order}
          navigationTargets={[]}
          onNavigate={() => {}}
          onReportLocation={() => {}}
          onAdvanceStatus={onAdvance}
          onUploadReceipt={() => {}}
          receiptFiles={{ loading: [], confirming: [] }}
          isAdvancing={false}
        />,
      );
    });

    const button = renderer?.root.findByProps({ testID: 'driver-advance-order-1' });
    await act(async () => {
      button?.props.onPress();
    });

    expect(onAdvance).toHaveBeenCalledWith({
      nextStatus: 'transporting',
    });
  });
});
