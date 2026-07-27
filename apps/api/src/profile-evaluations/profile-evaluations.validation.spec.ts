import { ZodError } from 'zod';
import {
  parseAdminEvaluationAuditListQuery,
  parseModerateAdminEvaluationRequest,
} from './profile-evaluations.validation';

describe('profile evaluations validation', () => {
  it('applies admin audit defaults and normalizes moderation filters', () => {
    expect(parseAdminEvaluationAuditListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(
      parseAdminEvaluationAuditListQuery({
        page: '2',
        pageSize: '10',
        direction: 'driver_to_shipper',
        moderationStatus: 'hidden',
        rating: '1',
        keyword: '  违规评价  ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      direction: 'driver_to_shipper',
      moderationStatus: 'hidden',
      rating: 1,
      keyword: '违规评价',
    });
  });

  it('rejects invalid admin audit moderation filters', () => {
    expect(() =>
      parseAdminEvaluationAuditListQuery({ moderationStatus: 'pending' }),
    ).toThrow(ZodError);
  });

  it('normalizes a moderation request', () => {
    expect(
      parseModerateAdminEvaluationRequest({
        status: 'hidden',
        reason: '  包含违规联系方式  ',
        baseModerationVersion: 0,
      }),
    ).toEqual({
      status: 'hidden',
      reason: '包含违规联系方式',
      baseModerationVersion: 0,
    });
  });

  it('rejects invalid moderation status, reason and version values', () => {
    expect(() =>
      parseModerateAdminEvaluationRequest({
        status: 'pending',
        reason: '违规内容',
        baseModerationVersion: 0,
      }),
    ).toThrow(ZodError);
    expect(() =>
      parseModerateAdminEvaluationRequest({
        status: 'hidden',
        reason: '短',
        baseModerationVersion: 0,
      }),
    ).toThrow('处置原因至少 2 个字符');
    expect(() =>
      parseModerateAdminEvaluationRequest({
        status: 'hidden',
        reason: '合规'.repeat(101),
        baseModerationVersion: 0,
      }),
    ).toThrow('处置原因最多 200 个字符');
    expect(() =>
      parseModerateAdminEvaluationRequest({
        status: 'hidden',
        reason: '包含违规内容',
        baseModerationVersion: -1,
      }),
    ).toThrow('评价处置版本不能小于 0');
    expect(() =>
      parseModerateAdminEvaluationRequest({
        status: 'hidden',
        reason: '包含违规内容',
        baseModerationVersion: '0',
      }),
    ).toThrow(ZodError);
  });
});
