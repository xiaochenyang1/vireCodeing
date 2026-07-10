import { ZodError } from 'zod';
import { parseSaveShipperProfileAddressBookRequest } from './profile-address-book.validation';

describe('profile address book validation', () => {
  it('parses a shipper profile address book snapshot', () => {
    expect(
      parseSaveShipperProfileAddressBookRequest({
        addresses: [
          {
            id: 'address-1',
            name: '宝安仓',
            address: ' 宝安区临时仓 ',
            contactText: '赵经理 13800138001',
            tagText: '常用装货地',
          },
        ],
        contacts: [
          {
            id: 'contact-1',
            name: ' 钱店长 ',
            roleText: '卸货负责人',
            phoneText: '13800138002',
            noteText: '南山门店',
          },
        ],
        clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
        baseUpdatedAtIso: '2026-07-03T08:30:00.000Z',
      }),
    ).toEqual({
      addresses: [
        {
          id: 'address-1',
          name: '宝安仓',
          address: '宝安区临时仓',
          contactText: '赵经理 13800138001',
          tagText: '常用装货地',
        },
      ],
      contacts: [
        {
          id: 'contact-1',
          name: '钱店长',
          roleText: '卸货负责人',
          phoneText: '13800138002',
          noteText: '南山门店',
        },
      ],
      clientUpdatedAtIso: '2026-07-03T08:00:00.000Z',
      baseUpdatedAtIso: '2026-07-03T08:30:00.000Z',
    });
  });

  it('rejects an invalid address book base version', () => {
    expect(() =>
      parseSaveShipperProfileAddressBookRequest({
        addresses: [],
        contacts: [],
        baseUpdatedAtIso: '不是时间',
      }),
    ).toThrow('地址簿基线版本不合法');
  });

  it('rejects too many shipper profile addresses', () => {
    expect(() =>
      parseSaveShipperProfileAddressBookRequest({
        addresses: Array.from({ length: 21 }, (_, index) => ({
          id: `address-${index}`,
          name: `地址 ${index}`,
          address: '宝安区临时仓',
          contactText: '赵经理 13800138001',
        })),
        contacts: [],
      }),
    ).toThrow(ZodError);
  });

  it('rejects an invalid profile contact phone', () => {
    expect(() =>
      parseSaveShipperProfileAddressBookRequest({
        addresses: [],
        contacts: [
          {
            id: 'contact-1',
            name: '钱店长',
            roleText: '卸货负责人',
            phoneText: '12345',
          },
        ],
      }),
    ).toThrow('手机号不合法');
  });
});
