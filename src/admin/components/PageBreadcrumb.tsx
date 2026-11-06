import { Link, useLocation, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { ProjectSummary, Report } from '@shared/types';

function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/reports')) return 'Reports';
  if (pathname.startsWith('/projects')) return 'Projects';
  return 'BugPin';
}

function Crumbs({ parent, current }: { parent: { label: string; to: string }; current?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      <Link
        to={parent.to}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        {parent.label}
      </Link>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h1 className="truncate font-medium" title={current}>
        {current ?? '…'}
      </h1>
    </nav>
  );
}

// Reads the same query keys the detail pages use, so the names come from their cache.
export function PageBreadcrumb() {
  const { canLoadData } = useAuth();
  const { pathname } = useLocation();
  const projectMatch = useMatch('/projects/:id');
  const reportMatch = useMatch('/reports/:id');
  const projectId = projectMatch?.params.id;
  const reportId = reportMatch?.params.id;

  const { data: projects } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () =>
      (await api.get<{ projects: ProjectSummary[] }>('/projects/summaries')).data.projects,
    enabled: canLoadData && Boolean(projectId),
  });
  const { data: reportData } = useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => (await api.get<{ report: Report }>(`/reports/${reportId}`)).data,
    enabled: canLoadData && Boolean(reportId),
  });

  if (projectId) {
    return (
      <Crumbs
        parent={{ label: 'Projects', to: '/projects' }}
        current={projects?.find((project) => project.id === projectId)?.name}
      />
    );
  }
  if (reportId) {
    return (
      <Crumbs parent={{ label: 'Reports', to: '/reports' }} current={reportData?.report?.title} />
    );
  }
  return <h1 className="text-sm font-medium">{sectionTitle(pathname)}</h1>;
}
