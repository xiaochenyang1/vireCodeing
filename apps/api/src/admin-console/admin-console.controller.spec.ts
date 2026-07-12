import { AdminConsoleController } from './admin-console.controller';
import { renderDriverCertificationAdminConsole } from './driver-certification-admin-console';

describe('driver certification admin console page', () => {
  it('renders the review console shell and API hooks', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('司机认证审核台');
    expect(html).toContain('adminToken');
    expect(html).toContain('/api/admin/driver-certifications');
    expect(html).toContain('/attachments');
    expect(html).toContain('/review-events');
    expect(html).toContain('/identity/review');
    expect(html).toContain('/vehicle/review');
    expect(html).toContain('approveIdentity');
    expect(html).toContain('rejectVehicle');
  });

  it('uses a dense operational layout instead of a marketing hero', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('class="console-shell"');
    expect(html).toContain('class="queue-panel"');
    expect(html).toContain('class="detail-panel"');
    expect(html).not.toContain('hero');
  });

  it('renders token empty error attachment and event states', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('暂无认证记录');
    expect(html).toContain('暂无附件');
    expect(html).toContain('暂无审核事件');
    expect(html).toContain('请填写驳回原因');
  });

  it('keeps API calls under the existing global api prefix', () => {
    const html = renderDriverCertificationAdminConsole();

    expect(html).toContain("const apiBase = '/api'");
    expect(html).not.toContain('http://localhost');
  });
});

describe('AdminConsoleController', () => {
  it('serves the driver certification console html', () => {
    const controller = new AdminConsoleController();

    expect(controller.getDriverCertificationConsole()).toContain(
      '司机认证审核台',
    );
  });

  it('serves the order attachment audit console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderAttachmentAuditConsole: () => string;
      }
    ).getOrderAttachmentAuditConsole();

    expect(html).toContain('订单附件审计台');
    expect(html).toContain('adminToken');
    expect(html).toContain('orderIdInput');
    expect(html).toContain('auditKeywordInput');
    expect(html).toContain('auditStatusInput');
    expect(html).toContain('auditShipperIdInput');
    expect(html).toContain('auditCreatedFromInput');
    expect(html).toContain('auditCreatedToInput');
    expect(html).toContain('auditMissingStateInput');
    expect(html).toContain('只看 missingFileIds');
    expect(html).toContain('只看无缺失引用');
    expect(html).toContain('auditPageInput');
    expect(html).toContain('auditPageSizeInput');
    expect(html).toContain('auditPaginationStatus');
    expect(html).toContain('auditPreviousPage');
    expect(html).toContain('auditNextPage');
    expect(html).toContain('loadAuditList');
    expect(html).toContain("const apiBase = '/api'");
    expect(html).toContain("/admin/orders/attachments");
    expect(html).toContain('/admin/orders/');
    expect(html).toContain('/attachments');
    expect(html).toContain('auditSummaryList');
    expect(html).toContain("query.set('status', status)");
    expect(html).toContain("query.set('shipperId', shipperId)");
    expect(html).toContain("query.set('createdFromIso', createdFromIso)");
    expect(html).toContain("query.set('createdToIso', createdToIso)");
    expect(html).toContain("query.set('hasMissingFiles', missingState)");
    expect(html).toContain("query.set('page', String(page))");
    expect(html).toContain("query.set('pageSize', String(pageSize))");
    expect(html).toContain('renderAuditPagination');
    expect(html).toContain('item.status');
    expect(html).toContain('item.createdAtIso');
    expect(html).toContain('item.shipperId');
    expect(html).toContain('item.hasMissingFiles');
    expect(html).toContain('cargoAttachmentList');
    expect(html).toContain('eventAttachmentList');
    expect(html).toContain('missingFileIds');
    expect(html).toContain('打开预览');
    expect(html).toContain('previewExpiresAtIso');
    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('请填写订单 ID');
    expect(html).not.toContain('hero');
  });

  it('serves the shipper coupon issue console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getShipperCouponConsole: () => string;
      }
    ).getShipperCouponConsole();

    expect(html).toContain('货主优惠券发放台');
    expect(html).toContain('adminToken');
    expect(html).toContain('shipperIdInput');
    expect(html).toContain('couponTitleInput');
    expect(html).toContain('conditionTextInput');
    expect(html).toContain('discountCentsInput');
    expect(html).toContain('minOrderAmountCentsInput');
    expect(html).toContain('validFromIsoInput');
    expect(html).toContain('validUntilIsoInput');
    expect(html).toContain('sourceTextInput');
    expect(html).toContain('issueCoupon');
    expect(html).toContain("const apiBase = '/api'");
    expect(html).toContain('/admin/shipper-coupons');
    expect(html).toContain('请先填写 admin access token');
    expect(html).toContain('优惠券失效时间必须晚于生效时间');
    expect(html).toContain('issuedCouponResult');
    expect(html).not.toContain('hero');
  });

  it('serves the order exception customer service console html', () => {
    const controller = new AdminConsoleController();
    const html = (
      controller as unknown as {
        getOrderExceptionCaseConsole: () => string;
      }
    ).getOrderExceptionCaseConsole();

    expect(html).toContain('异常客服工单');
    expect(html).toContain('adminToken');
    expect(html).toContain('/admin/order-exception-cases');
    expect(html).toContain('/process');
    expect(html).toContain('/resolve');
    expect(html).toContain('/close');
    expect(html).toContain('baseUpdatedAtIso');
    expect(html).toContain('EXCEPTION_CASE_CONFLICT');
    expect(html).toContain('caseStatusInput');
    expect(html).toContain('caseSourceRoleInput');
    expect(html).toContain('caseKeywordInput');
    expect(html).not.toContain('hero');
  });
});
