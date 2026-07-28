import { ZodError } from 'zod';
import {
  parseAdminEvaluationAuditListQuery,
  parseModerateAdminEvaluationRequest,
  parseResolveAdminEvaluationAppealRequest,
  parseSubmitEvaluationAppealRequest,
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
        appealStatus: 'requested',
        rating: '1',
        keyword: '  违规评价  ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      direction: 'driver_to_shipper',
      moderationStatus: 'hidden',
      appealStatus: 'requested',
      rating: 1,
      keyword: '违规评价',
    });
  });

  it('rejects invalid admin audit moderation filters', () => {
    expect(() =>
      parseAdminEvaluationAuditListQuery({ moderationStatus: 'pending' }),
    ).toThrow(ZodError);
    expect(() =>
      parseAdminEvaluationAuditListQuery({ appealStatus: 'pending' }),
    ).toThrow(ZodError);
  });

  it('normalizes author appeal and admin decision requests', () => {
    expect(
      parseSubmitEvaluationAppealRequest({
        reason: '  评价内容来自真实运输经历，请重新复核。  ',
        baseModerationVersion: 1,
      }),
    ).toEqual({
      reason: '评价内容来自真实运输经历，请重新复核。',
      baseModerationVersion: 1,
    });
    expect(
      parseResolveAdminEvaluationAppealRequest({
        decision: 'rejected',
        reason: '  原处置依据充分  ',
        baseAppealVersion: 1,
        baseModerationVersion: 2,
      }),
    ).toEqual({
      decision: 'rejected',
      reason: '原处置依据充分',
      baseAppealVersion: 1,
      baseModerationVersion: 2,
    });
  });

  it('rejects short appeal reasons and stale decision versions', () => {
    expect(() =>
      parseSubmitEvaluationAppealRequest({
        reason: '理由太短',
        baseModerationVersion: 1,
      }),
    ).toThrow('评价申诉理由至少 6 个字符');
    expect(() =>
      parseResolveAdminEvaluationAppealRequest({
        decision: 'accepted',
        reason: '同意恢复',
        baseAppealVersion: 0,
        baseModerationVersion: 1,
      }),
    ).toThrow('评价申诉版本不能小于 1');
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
