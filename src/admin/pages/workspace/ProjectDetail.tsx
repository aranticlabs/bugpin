import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pin } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { ProjectStatusBadge } from '../../components/project/ProjectStatusBadge';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { ProjectIntegrations } from '../../components/project/ProjectIntegrations';
import {
  ProjectSettingsPanel,
  type ProjectSettingsSection,
} from '../../components/project/ProjectSettingsPanel';
import { Reports } from './Reports';
import { Webhooks } from '../console/Webhooks';
import type { PinnedProject, ProjectSummary } from '@shared/types';

type ApiError = Error & { response?: { data?: { message?: string } } };

const SETTINGS_TABS: { value: ProjectSettingsSection; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'launcher', label: 'Launcher Button' },
  { value: 'dialog', label: 'Dialog' },
  { value: 'language', label: 'Language' },
  { value: 'capture', label: 'Capture' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'reporter-portal', label: 'Reporter Portal' },
];

type ProjectTab = 'reports' | ProjectSettingsSection | 'integrations';

function isSettingsTab(tab: ProjectTab): tab is ProjectSettingsSection {
  return SETTINGS_TABS.some((item) => item.value === tab);
}

function toProjectTab(value: string | null): ProjectTab {
  if (value === 'integrations') return 'integrations';
  return SETTINGS_TABS.find((item) => item.value === value)?.value ?? 'reports';
}

function PinButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const queryClient = useQueryClient();
  const { data: pinned = [] } = useQuery({
    queryKey: ['pinned-projects'],
    queryFn: async () =>
      (await api.get<{ projects: PinnedProject[] }>('/projects/pinned')).data.projects,
  });
  const isPinned = pinned.some((project) => project.id === projectId);
  const toggle = useMutation({
    mutationFn: async () =>
      isPinned ? api.delete(`/projects/${projectId}/pin`) : api.put(`/projects/${projectId}/pin`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }),
    onError: (error: ApiError) =>
      toast.error(error.response?.data?.message || 'Failed to update pinned projects'),
  });

  const tooltip = isPinned ? 'Unpin from the sidebar' : 'Pin to the sidebar';

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The wrapper keeps the tooltip working while the button is disabled. */}
          <span className="inline-flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggle.mutate()}
              disabled={toggle.isPending}
              aria-label={isPinned ? `Unpin ${projectName}` : `Pin ${projectName}`}
              aria-pressed={isPinned}
            >
              <Pin className={isPinned ? 'fill-current text-primary' : undefined} />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ProjectDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = toProjectTab(searchParams.get('tab'));
  const tab: ProjectTab = isAdmin ? requestedTab : 'reports';

  const { data: projects, isLoading } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () =>
      (await api.get<{ projects: ProjectSummary[] }>('/projects/summaries')).data.projects,
  });
  const project = projects?.find((candidate) => candidate.id === id);

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/projects">
        <ArrowLeft />
        All Projects
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        {backLink}
        <Alert>
          <AlertDescription>This project does not exist or was deleted.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const header = (
    <div className="space-y-2">
      {backLink}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <PinButton projectId={project.id} projectName={project.name} />
        <ProjectStatusBadge project={project} />
      </div>
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {header}
        <Reports projectId={project.id} />
      </div>
    );
  }

  const tabList = (
    <TabsList variant="line">
      <TabsTrigger value="reports">Reports</TabsTrigger>
      {SETTINGS_TABS.map((item) => (
        <TabsTrigger key={item.value} value={item.value}>
          {item.label}
        </TabsTrigger>
      ))}
      <TabsTrigger value="integrations">Integrations</TabsTrigger>
    </TabsList>
  );

  const selectTab = (value: string) => {
    const next = toProjectTab(value);
    setSearchParams(next === 'reports' ? {} : { tab: next });
  };

  return (
    <div className="space-y-6">
      {header}
      <Tabs value={tab} onValueChange={selectTab}>
        {/* On the Reports tab the tab bar shares a row with the Create Report button. */}
        {tab !== 'reports' && tabList}
        <TabsContent value="reports" className="mt-0">
          <Reports projectId={project.id} headerStart={tabList} />
        </TabsContent>
        <TabsContent value="integrations" className="mt-6 max-w-4xl space-y-6">
          <ProjectIntegrations projectId={project.id} />
          <Webhooks projectId={project.id} />
        </TabsContent>
      </Tabs>
      {/* Stays mounted across the settings tabs so unsaved edits survive switching tabs. */}
      <div className={isSettingsTab(tab) ? 'space-y-6' : 'hidden'}>
        <ProjectSettingsPanel
          projectId={project.id}
          section={isSettingsTab(tab) ? tab : 'general'}
        />
      </div>
    </div>
  );
}
