import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import type { PortalReportDetail } from '@shared/portal-types';
import { Button } from '@shared-ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared-ui/components/ui/card';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import { Textarea } from '@shared-ui/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared-ui/components/ui/select';
import { useProjects } from '../hooks/useProjects';
import { useI18n } from '../i18n/I18nProvider';
import { errorKey } from '../i18n/error-key';
import { portalFetch, PortalApiError } from '../api/client';
import { FilePicker } from '../components/FilePicker';
import { QueryState } from '../components/QueryState';

export function NewReport() {
  const { t } = useI18n();
  const projects = useProjects();
  const [search] = useSearchParams();
  const [projectId, setProjectId] = useState(search.get('projectId') ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const allowed = projects.data?.filter((project) => project.allowNewReports) ?? [];
  const project = projectId ? allowed.find((value) => value.id === projectId) : allowed[0];
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!projectId && project) setProjectId(project.id);
  }, [projectId, project]);
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new PortalApiError(403, 'SUBMISSION_DISABLED');
      const form = new FormData();
      form.set('projectId', project.id);
      form.set('title', title);
      form.set('description', description);
      files.forEach((file) => form.append('files[]', file));
      return portalFetch<{ report: PortalReportDetail }>('/reports', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: async ({ report }) => {
      await client.invalidateQueries({ queryKey: ['portal'] });
      if (mounted.current) navigate(`/reports/${encodeURIComponent(report.id)}`);
    },
    onError: () => {
      void projects.refetch();
    },
  });
  if (projects.isPending) return <QueryState loading />;
  if (projects.isError) return <QueryState retry={() => void projects.refetch()} />;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (project && !mutation.isPending) mutation.mutate();
  }
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/reports">
          <ArrowLeft />
          {t('myReports')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t('newReport')}</h1>
          </CardTitle>
          <CardDescription>{t('newReportHint')}</CardDescription>
        </CardHeader>
        {!allowed.length ? (
          <CardContent>
            <p>{t('noSubmissionProjects')}</p>
          </CardContent>
        ) : (
          <form onSubmit={submit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="project">{t('project')}</Label>
                <Select
                  value={project?.id ?? ''}
                  disabled={mutation.isPending}
                  onValueChange={(id) => {
                    setProjectId(id);
                    setFiles([]);
                  }}
                >
                  <SelectTrigger id="project">
                    <SelectValue placeholder={t('project')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allowed.map((value) => (
                      <SelectItem key={value.id} value={value.id}>
                        {value.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-title">{t('title')}</Label>
                <Input
                  id="report-title"
                  value={title}
                  minLength={4}
                  maxLength={500}
                  required
                  disabled={mutation.isPending || !project}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-description">{t('description')}</Label>
                <Textarea
                  id="report-description"
                  className="min-h-32"
                  value={description}
                  maxLength={10000}
                  disabled={mutation.isPending || !project}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <FilePicker
                files={files}
                onChange={setFiles}
                project={project}
                disabled={mutation.isPending}
              />
              {mutation.isError && (
                <p role="alert" className="text-destructive">
                  {t(errorKey(mutation.error))}
                </p>
              )}
            </CardContent>
            <CardFooter className="flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => navigate('/reports')}
              >
                {t('cancel')}
              </Button>
              <Button disabled={mutation.isPending || !project || title.trim().length < 4}>
                {!mutation.isPending && <Send />}
                {t(mutation.isPending ? 'loading' : 'submit')}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
