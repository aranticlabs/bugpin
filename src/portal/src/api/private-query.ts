export function isPrivatePortalQuery(query: { queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] === 'portal' && query.queryKey[1] !== 'config';
}
