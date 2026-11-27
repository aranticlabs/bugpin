export type LoginTokenKind = 'reporter' | 'team';

export interface LoginToken {
  kind: LoginTokenKind;
  token: string;
}

const tokenPaths: Record<string, LoginTokenKind> = {
  '/reporter-portal/login': 'reporter',
  '/reporter-portal/team-login/verify': 'team',
};

export function takeLoginToken(): LoginToken | null {
  const kind = tokenPaths[window.location.pathname.replace(/\/$/, '')];
  if (!kind) return null;
  const token = window.location.hash.slice(1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search
  );
  return { kind, token };
}
