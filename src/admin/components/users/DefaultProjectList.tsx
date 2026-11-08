import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { cn } from '../../lib/utils';
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';
import { Spinner } from '../ui/spinner';
import { canReceiveDefaultProjects } from './userHelpers';
import { useToggleDefaultProject } from './useUsers';
import type { Project, User } from '@shared/types';

function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects')).data.projects as Project[],
  });
}

/** Checkboxes for the projects whose new reports are assigned to the user */
export function DefaultProjectList({ user, className }: { user: User; className?: string }) {
  const { data: projects = [], isLoading } = useProjects();
  const toggle = useToggleDefaultProject();
  const selected = new Set((user.defaultProjects ?? []).map((project) => project.id));
  const canReceive = canReceiveDefaultProjects(user);

  return (
    <ScrollArea className={className} contentClassName="p-2">
      {isLoading ? (
        <div className="py-4 text-center">
          <Spinner className="mx-auto text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">No projects available.</p>
      ) : (
        projects.map((project) => {
          const checked = selected.has(project.id);
          const disabled = !checked && !canReceive;
          return (
            <label
              key={project.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-primary-tint',
                disabled && 'pointer-events-none opacity-60'
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => toggle(user, project, next === true)}
              />
              <span className="flex-1">{project.name}</span>
            </label>
          );
        })
      )}
    </ScrollArea>
  );
}
