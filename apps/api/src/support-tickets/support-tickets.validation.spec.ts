import { ZodError } from 'zod';
import {
  parseAdminSupportTicketListQuery,
  parseCreateShipperSupportTicketRequest,
  parseSupportTicketId,
  parseUpdateShipperSupportTicketRequest,
} from './support-tickets.validation';

describe('support tickets validation', () => {
  it('parses a shipper support ticket create request', () => {
    expect(
      parseCreateShipperSupportTicketRequest({
        channelName: ' 投诉建议 ',
        description: ' 司机沟通不及时，希望客服协助跟进 ',
      }),
    ).toEqual({
      channelName: '投诉建议',
      description: '司机沟通不及时，希望客服协助跟进',
    });
  });

  it('rejects an empty support ticket channel', () => {
    expect(() =>
      parseCreateShipperSupportTicketRequest({
        channelName: '   ',
        description: '司机沟通不及时，希望客服协助跟进',
      }),
    ).toThrow('服务渠道不能为空');
  });

  it('rejects an empty support ticket description', () => {
    expect(() =>
      parseCreateShipperSupportTicketRequest({
        channelName: '投诉建议',
        description: '   ',
      }),
    ).toThrow('问题说明不能为空');
  });

  it('rejects a too long support ticket description', () => {
    expect(() =>
      parseCreateShipperSupportTicketRequest({
        channelName: '投诉建议',
        description: '问'.repeat(201),
      }),
    ).toThrow(ZodError);
  });

  it('parses admin support ticket list filters', () => {
    expect(
      parseAdminSupportTicketListQuery({
        page: '2',
        pageSize: '10',
        status: 'processing',
        keyword: ' 投诉建议 ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      status: 'processing',
      keyword: '投诉建议',
    });
  });

  it('parses admin support ticket transition requests', () => {
    expect(
      parseUpdateShipperSupportTicketRequest({
        baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
        content: ' 已联系货主补充订单信息，当前转客服受理 ',
      }),
    ).toEqual({
      baseUpdatedAtIso: '2026-07-22T08:30:00.000Z',
      content: '已联系货主补充订单信息，当前转客服受理',
    });
  });

  it('rejects invalid admin support ticket transition requests', () => {
    expect(() =>
      parseUpdateShipperSupportTicketRequest({
        baseUpdatedAtIso: 'bad-date',
        content: '太短',
      }),
    ).toThrow('工单版本时间不合法');
  });

  it('rejects an empty support ticket id', () => {
    expect(() => parseSupportTicketId('   ')).toThrow('工单 ID 不能为空');
  });
});
