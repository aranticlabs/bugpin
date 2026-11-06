import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import {
  useDashboardOverview,
  useDashboardPersonal,
  useDashboardReports,
} from '../../hooks/useDashboard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Spinner } from '../../components/ui/spinner';
import { TooltipProvider } from '../../components/ui/tooltip';
import {
  ActivityCard,
  BacklogPriorityCard,
  IntakeChartCard,
  KpiRow,
} from '../../components/dashboard/OverviewCards';
import { ReportListsCard } from '../../components/dashboard/ReportListsCard';
import { ImpactStrip, ResolveTimeCard } from '../../components/dashboard/PersonalCards';
import { UnlockDialog, unlockedAchievements } from '../../components/dashboard/achievements';
import { GREETINGS, dayPartFor } from '../../lib/dashboard';
import { formatClockTime } from '../../lib/clock';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';
import {
  ACHIEVEMENT_IDS,
  DASHBOARD_RANGES,
  type AchievementId,
  type DashboardRange,
  type GamificationProgress,
  type ProjectSummary,
} from '@shared/types';

const ALL_PROJECTS = 'all';

/**
 * Announces each achievement once. The first time preferences are seen, everything already
 * unlocked is recorded silently so existing users are not shown a backlog of dialogs.
 */
function useAchievementAnnouncement(game: GamificationProgress | null | undefined) {
  const { preferences, isLoaded, updatePreferences } = useUserPreferences();
  const [announcing, setAnnouncing] = useState<AchievementId | null>(null);
  const stored = preferences?.seenAchievements;
  // Ids of achievements that no longer exist are dropped, or saving the list would be rejected
  const seen = useMemo(
    () => stored?.filter((id) => (ACHIEVEMENT_IDS as readonly string[]).includes(id)),
    [stored]
  );
  const save = useRef(updatePreferences);
  save.current = updatePreferences;

  useEffect(() => {
    if (!game || !isLoaded) return;
    const unlocked = unlockedAchievements(game.achievements).map((item) => item.id);
    if (seen === undefined) {
      save.current({ seenAchievements: unlocked });
      return;
    }
    const fresh = unlocked.filter((id) => !seen.includes(id));
    if (fresh.length === 0) return;
    setAnnouncing(fresh[0]);
    save.current({ seenAchievements: [...seen, ...fresh] });
  }, [game, isLoaded, seen]);

  return { announcing, dismiss: () => setAnnouncing(null) };
}

export function Dashboard() {
  const { user } = useAuth();
  const now = useCurrentMinute();
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
  const [range, setRange] = useState<DashboardRange>(30);
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const selectedProject = projectId === ALL_PROJECTS ? undefined : projectId;

  const { data: projects = [] } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () => {
      const response = await api.get('/projects/summaries');
      return response.data.projects as ProjectSummary[];
    },
  });
  const overview = useDashboardOverview(selectedProject, range);
  const personal = useDashboardPersonal(canEdit);
  const assigned = useDashboardReports({
    projectId: selectedProject,
    assignedToMe: true,
    enabled: canEdit,
  });
  const recent = useDashboardReports({ projectId: selectedProject });
  const game = personal.data?.gamification;
  const { announcing, dismiss } = useAchievementAnnouncement(game);

  if (!user) return null;

  const firstName = user.name.split(' ')[0] || user.name;
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {GREETINGS[dayPartFor(now.getHours())]}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {today} ·{' '}
              <time dateTime={now.toISOString()} className="tabular-nums">
                {formatClockTime(now)}
              </time>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-44" aria-label="Filter by project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(range)}
              onValueChange={(value) => setRange(Number(value) as DashboardRange)}
            >
              <SelectTrigger className="w-36" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DASHBOARD_RANGES.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    Last {days} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!overview.data ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" className="text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {canEdit && personal.data && <ImpactStrip personal={personal.data} />}
            <KpiRow kpis={overview.data.kpis} />
            <div className="grid gap-4 xl:grid-cols-3">
              <IntakeChartCard
                intake={overview.data.intake}
                range={range}
                className="xl:col-span-2"
              />
              <BacklogPriorityCard backlog={overview.data.backlogByPriority} />
            </div>
            {canEdit && personal.data ? (
              <div className="grid gap-4 xl:grid-cols-3">
                <ResolveTimeCard summary={personal.data.resolveTime} className="xl:col-span-2" />
                <ActivityCard activity={overview.data.activity} fillHeight />
              </div>
            ) : (
              <ActivityCard activity={overview.data.activity} />
            )}
            <ReportListsCard
              needsAttention={overview.data.needsAttention}
              needsAttentionTotal={overview.data.needsAttentionTotal}
              assigned={assigned.data}
              recent={recent.data}
              projectId={selectedProject}
              canEdit={canEdit}
              showXp={!!game}
              currentUserId={user.id}
            />
          </div>
        )}

        <UnlockDialog achievementId={announcing} onClose={dismiss} />
      </div>
    </TooltipProvider>
  );
}
