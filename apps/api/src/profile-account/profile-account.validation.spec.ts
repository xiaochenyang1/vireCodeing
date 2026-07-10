import { ZodError } from 'zod';
import { parseSaveShipperProfileAccountRequest } from './profile-account.validation';

describe('profile account validation', () => {
  it('parses a shipper account request', () => {
    expect(
      parseSaveShipperProfileAccountRequest({
        displayName: ' 晨星货主 ',
      }),
    ).toEqual({
      displayName: '晨星货主',
    });
  });

  it('rejects an empty shipper display name', () => {
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '   ',
      }),
    ).toThrow('昵称不能为空');
  });

  it('rejects a too long shipper display name', () => {
    expect(() =>
      parseSaveShipperProfileAccountRequest({
        displayName: '晨'.repeat(31),
      }),
    ).toThrow(ZodError);
  });
});
