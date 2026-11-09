export function takeLoginToken(): string {
  if (window.location.pathname.replace(/\/$/, '') !== '/reporter-portal/login') return '';
  const token = window.location.hash.slice(1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return '';
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search
  );
  return token;
}
