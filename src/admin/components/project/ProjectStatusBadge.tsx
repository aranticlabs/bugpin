import { Badge } from '../ui/badge';
import type { ProjectSummary } from '@shared/types';

export type ProjectStatusKey = 'active' | 'paused' | 'read-only';

export function projectStatus(project: Pick<ProjectSummary, 'isActive' | 'licenseLocked'>): {
  label: string;
  rank: number;
  filter: ProjectStatusKey;
} {
  if (project.licenseLocked)
    return { label: 'Read-only · License limit', rank: 2, filter: 'read-only' };
  if (project.isActive === false) return { label: 'Paused', rank: 1, filter: 'paused' };
  return { label: 'Active', rank: 0, filter: 'active' };
}

export function ProjectStatusBadge({
  project,
}: {
  project: Pick<ProjectSummary, 'isActive' | 'licenseLocked'>;
}) {
  const status = projectStatus(project);
  return (
    <Badge variant="outline" className={status.rank === 0 ? 'status-active' : 'status-inactive'}>
      {status.label}
    </Badge>
  );
}
