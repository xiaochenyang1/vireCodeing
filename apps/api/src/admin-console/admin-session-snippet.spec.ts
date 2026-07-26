import { runInNewContext } from 'node:vm';

import { renderAdminSessionScript } from './admin-session-snippet';

function buildLoginHref(
  currentRoute: string,
  location?: { pathname?: unknown; search?: unknown },
) {
  return String(
    runInNewContext(
      `${renderAdminSessionScript({ currentRoute })}\nbuildAdminLoginHref();`,
      location ? { location } : {},
    ),
  );
}

describe('admin session snippet', () => {
  it('keeps the current admin pathname and query in the login redirect', () => {
    const redirect =
      '/api/admin/finance-console?tab=refunds&orderId=order-1&page=2';

    expect(
      buildLoginHref('/api/admin/finance-console', {
        pathname: '/api/admin/finance-console',
        search: '?tab=refunds&orderId=order-1&page=2',
      }),
    ).toBe('/api/admin/login?redirect=' + encodeURIComponent(redirect));
  });

  it.each([
    '/api/admin',
    '/api/adminish/finance-console',
    '/orders',
    'https://example.com/api/admin/finance-console',
  ])('falls back from a non-admin runtime pathname: %s', (pathname) => {
    const redirect = '/api/admin/console';

    expect(
      buildLoginHref('/api/admin/console', {
        pathname,
        search: '?status=pending',
      }),
    ).toBe('/api/admin/login?redirect=' + encodeURIComponent(redirect));
  });

  it('falls back to the configured route when runtime location is unavailable', () => {
    expect(buildLoginHref('/api/admin/order-management-console')).toBe(
      '/api/admin/login?redirect=' +
        encodeURIComponent('/api/admin/order-management-console'),
    );
  });

  it('refreshes the login redirect when route state changes after initialization', () => {
    const location = {
      pathname: '/api/admin/order-management-console',
      search: '?page=1',
    };
    let clickHandler: (() => void) | undefined;
    const link = {
      href: '',
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'click') {
          clickHandler = handler;
        }
      },
    };
    const document = {
      getElementById: (id: string) => (id === 'adminLoginLink' ? link : null),
    };

    runInNewContext(
      `${renderAdminSessionScript({
        currentRoute: '/api/admin/order-management-console',
      })}\ninitializeAdminSession();`,
      { document, location },
    );

    location.search = '?page=3&orderId=order-3';
    clickHandler?.();

    expect(link.href).toBe(
      '/api/admin/login?redirect=' +
        encodeURIComponent(
          '/api/admin/order-management-console?page=3&orderId=order-3',
        ),
    );
  });
});
