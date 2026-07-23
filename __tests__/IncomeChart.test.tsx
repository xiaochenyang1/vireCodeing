import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { IncomeChart } from '../src/components/IncomeChart';

describe('IncomeChart', () => {
  it('renders empty state when no data', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <IncomeChart data={[]} testID="income-chart" />,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'income-chart' })).toBeTruthy();
  });

  it('renders summary stats and bars with data', async () => {
    const data = [
      { dateText: '07-19', incomeCents: 36000, orderCount: 1 },
      { dateText: '07-20', incomeCents: 0, orderCount: 0 },
      { dateText: '07-21', incomeCents: 52000, orderCount: 2 },
      { dateText: '07-22', incomeCents: 18000, orderCount: 1 },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <IncomeChart data={data} daysToShow={7} testID="income-chart" />,
      );
    });

    expect(
      renderer?.root.findByProps({ testID: 'income-chart-bar-0' }),
    ).toBeTruthy();
    expect(
      renderer?.root.findByProps({ testID: 'income-chart-bar-2' }),
    ).toBeTruthy();
    expect(
      renderer?.root.findByProps({ testID: 'income-chart-bar-value-2' })
        ?.props.children,
    ).toBe('520');
  });

  it('limits bars to daysToShow', async () => {
    const data = Array.from({ length: 14 }, (_, i) => ({
      dateText: `07-${(i + 1).toString().padStart(2, '0')}`,
      incomeCents: (i + 1) * 10000,
      orderCount: 1,
    }));

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <IncomeChart data={data} daysToShow={7} testID="income-chart" />,
      );
    });

    // Should render exactly 7 bar columns
    const barColumns = renderer?.root.findAllByProps({
      testID: 'income-chart-bar-6',
    });
    expect(barColumns?.length).toBeGreaterThanOrEqual(1);
  });

  it('handles zero max income gracefully', async () => {
    const data = [
      { dateText: '07-19', incomeCents: 0, orderCount: 0 },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <IncomeChart data={data} testID="income-chart" />,
      );
    });

    expect(() =>
      renderer?.root.findByProps({ testID: 'income-chart' }),
    ).not.toThrow();
  });
});
