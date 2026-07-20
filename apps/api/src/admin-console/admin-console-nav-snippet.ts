const adminConsoleNavItems = [
  {
    label: '后台首页',
    route: '/api/admin/console',
  },
  {
    label: '司机认证',
    route: '/api/admin/driver-certification-console',
  },
  {
    label: '订单管理',
    route: '/api/admin/order-management-console',
  },
  {
    label: '会话治理',
    route: '/api/admin/session-governance-console',
  },
  {
    label: '账号管理',
    route: '/api/admin/account-management-console',
  },
  {
    label: '权限矩阵',
    route: '/api/admin/permission-matrix-console',
  },
  {
    label: '附件审计',
    route: '/api/admin/order-attachment-console',
  },
  {
    label: '文件维护',
    route: '/api/admin/file-maintenance-console',
  },
  {
    label: '异常工单',
    route: '/api/admin/order-exception-case-console',
  },
  {
    label: '优惠券',
    route: '/api/admin/shipper-coupon-console',
  },
  {
    label: '评价审计',
    route: '/api/admin/evaluation-audit-console',
  },
  {
    label: '财务',
    route: '/api/admin/finance-console',
  },
] as const;

type AdminConsoleNavOptions = {
  currentRoute: string;
  wrapperClass?: string;
  linkClass?: string;
  activeClass?: string;
};

export function renderAdminConsoleNavStyles() {
  return `
    .admin-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .admin-nav-link {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--line, #d8dee4);
      background: #fff;
      color: var(--accent, #1769aa);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
    }
    .admin-nav-link.active {
      border-color: currentColor;
      background: rgba(23, 105, 170, 0.08);
    }
  `;
}

export function renderAdminConsoleNav({
  currentRoute,
  wrapperClass = 'admin-nav',
  linkClass = 'admin-nav-link',
  activeClass = 'active',
}: AdminConsoleNavOptions) {
  return `<nav aria-label="后台导航" class="${wrapperClass}">${adminConsoleNavItems
    .map((item) => {
      const classes =
        item.route === currentRoute
          ? `${linkClass} ${activeClass}`
          : linkClass;

      return `<a class="${classes}" href="${item.route}">${item.label}</a>`;
    })
    .join('')}</nav>`;
}
