import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { ValueAddedServicesSection } from '../src/screens/order-draft/ValueAddedServicesSection';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join('');
}

async function renderValueAddedServicesSection(
  props?: Partial<React.ComponentProps<typeof ValueAddedServicesSection>>,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ValueAddedServicesSection
        valueAddedServiceIds={[]}
        onToggleValueAddedService={jest.fn()}
        loadingWorkerCount={1}
        onLoadingWorkerCountChange={jest.fn()}
        insuredValueText=""
        onInsuredValueTextChange={jest.fn()}
        {...props}
      />,
    );
  });

  return renderer;
}

describe('ValueAddedServicesSection', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows estimate guidance before any local reference fee is generated', async () => {
    const renderer = await renderValueAddedServicesSection();

    expect(getRenderedText(renderer)).toContain(
      '可先记录装卸、保价和包装需求；选中后会生成本地参考附加费预估。',
    );
  });

  it('shows active estimate guidance when a local reference fee is available', async () => {
    const renderer = await renderValueAddedServicesSection({
      valueAddedServiceIds: ['loading', 'protection'],
      serviceEstimate: {
        lineTexts: ['装卸协助：￥40（1 人）', '防震包装：￥30（固定附加费）'],
        totalAmountText: '￥70',
        noticeText: '本地参考附加费不会自动叠加到一口价，请按实际需求自行计入报价。',
      },
    });

    const renderedText = getRenderedText(renderer);

    expect(renderedText).toContain(
      '当前会基于已选增值服务生成本地参考附加费预估，不会自动叠加到一口价。',
    );
    expect(renderedText).toContain('参考附加费合计：￥70');
  });
});
