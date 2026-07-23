import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { BonusForm } from '../src/screens/order-detail/BonusForm';

function getRenderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter(Boolean)
    .join(' ');
}

describe('BonusForm', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders current and accumulated bonus preview text', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <BonusForm currentBonusText="￥20" onSubmit={jest.fn()} />,
      );
    });

    expect(getRenderedText(renderer)).toContain('当前曝光赏金：￥20');
    expect(getRenderedText(renderer)).toContain('追加后总赏金：￥40');

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'bonus-option-50' }).props.onPress();
    });

    expect(getRenderedText(renderer)).toContain('追加后总赏金：￥70');
  });
});
