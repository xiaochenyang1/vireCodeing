import { parseCreateShipperInvoiceApplicationRequest } from './profile-invoices.validation';

describe('profile invoices validation', () => {
  it('parses a current shipper invoice application request', () => {
    expect(
      parseCreateShipperInvoiceApplicationRequest({
        invoiceType: 'vat-special',
        invoiceTitleType: 'enterprise',
        invoiceTitle: ' 深圳晨星贸易有限公司 ',
        receiverEmail: ' finance@chenxing.example ',
        orderIds: [' order-1 ', 'order-2'],
      }),
    ).toEqual({
      invoiceType: 'vat-special',
      invoiceTitleType: 'enterprise',
      invoiceTitle: '深圳晨星贸易有限公司',
      receiverEmail: 'finance@chenxing.example',
      orderIds: ['order-1', 'order-2'],
    });
  });

  it('rejects duplicate invoice order ids before creating the request', () => {
    expect(() =>
      parseCreateShipperInvoiceApplicationRequest({
        invoiceType: 'normal',
        invoiceTitleType: 'personal',
        invoiceTitle: '晨星货主',
        receiverEmail: 'finance@chenxing.example',
        orderIds: ['order-1', ' order-1 '],
      }),
    ).toThrow('开票订单不能重复选择');
  });
});
