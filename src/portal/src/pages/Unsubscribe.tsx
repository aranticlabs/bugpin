import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@shared-ui/components/ui/button';
import { AuthCard } from '../components/AuthCard';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n/I18nProvider';

export function Unsubscribe() {
  const [search] = useSearchParams();
  const { t, locale } = useI18n();
  const token = search.get('t') ?? '';
  const url = `/api/portal/unsubscribe?${new URLSearchParams({ t: token, locale })}`;
  const query = useQuery({
    queryKey: ['unsubscribe', token],
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { credentials: 'omit', signal });
      if (response.status === 400) return false;
      if (!response.ok) throw new Error('REQUEST_FAILED');
      return true;
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });
      if (!response.ok) throw new Error('REQUEST_FAILED');
    },
  });
  if (query.isPending) return <QueryState loading />;
  if (query.isError) return <QueryState retry={() => void query.refetch()} />;
  return (
    <AuthCard title={t('unsubscribe')}>
      <p role={mutation.isSuccess ? 'status' : undefined}>
        {t(
          !query.data
            ? 'invalidUnsubscribe'
            : mutation.isSuccess
              ? 'unsubscribed'
              : 'unsubscribeIntro'
        )}
      </p>
      {query.data && !mutation.isSuccess && (
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {t(mutation.isPending ? 'loading' : 'unsubscribe')}
        </Button>
      )}
      {mutation.isError && (
        <p role="alert" className="text-destructive">
          {t('requestFailed')}
        </p>
      )}
    </AuthCard>
  );
}
