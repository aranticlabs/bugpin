import { Check, MessageSquare, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ReportPriorityLabel } from '../report/ReportStatusPriority';
import { AchievementArt } from './AchievementArt';
import { TeamTab } from './TeamTab';
import { cn } from '../../lib/utils';
import { formatDay } from '../../lib/dashboard';
import {
  EARLY_RESOLVE_MINUTES,
  LEVEL_XP,
  REPORT_PRIORITIES,
  XP_BY_PRIORITY,
  XP_PER_REPORTER_MESSAGE,
  type AchievementId,
  type AchievementProgress,
  type GamificationProgress,
} from '@shared/types';

const LEVEL_TITLES = [
  'Newcomer',
  'Spotter',
  'Tracker',
  'Fixer',
  'Debugger',
  'Troubleshooter',
  'Bug Hunter',
  'Exterminator',
  'Bug Whisperer',
  'Legend',
] as const;

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length, Math.max(1, level)) - 1];
}

export const ACHIEVEMENTS: Record<AchievementId, { title: string; description: string }> = {
  hatchling: {
    title: 'Hatchling',
    description: 'Resolve your first bug. Everyone starts small',
  },
  cocoon: {
    title: 'Cocoon',
    description: 'Resolve 100 bugs. Something is taking shape',
  },
  butterfly: {
    title: 'Butterfly',
    description: 'Resolve 500 bugs. Fully transformed',
  },
  firefly: {
    title: 'Firefly',
    description: 'Resolve a highest-priority bug within 4 h of getting it',
  },
  dragonfly: {
    title: 'Dragonfly',
    description: 'Set the priority of 50 new bugs within an hour of arrival',
  },
  ladybug: {
    title: 'Ladybug',
    description: 'Resolve 25 bugs that stay fixed for 14 days',
  },
  web_weaver: {
    title: 'Web weaver',
    description: 'Resolve bugs in 5 different projects',
  },
  amber: {
    title: 'Amber find',
    description: 'Resolve a bug that waited more than 90 days',
  },
};

/** Most recently unlocked first */
export function unlockedAchievements(achievements: AchievementProgress[]): AchievementProgress[] {
  return achievements
    .filter((item) => item.unlockedAt)
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
}

export function AchievementBadge({
  achievement,
  unlocked,
  decorative = false,
  className,
}: {
  achievement: AchievementId;
  unlocked: boolean;
  /** Hide from assistive tech when the surrounding card already names the achievement. */
  decorative?: boolean;
  className?: string;
}) {
  const title = ACHIEVEMENTS[achievement].title;
  return (
    <AchievementArt
      achievement={achievement}
      label={decorative ? undefined : `${title}, ${unlocked ? 'unlocked' : 'locked'}`}
      className={cn('shrink-0', !unlocked && 'opacity-40 grayscale', className)}
    />
  );
}

export type ProgressTab = 'levels' | 'achievements' | 'team';

/** Every tab fills the same fixed-height area and scrolls on its own */
const TAB_PANEL = 'mt-4 -mr-3 min-h-0 flex-1 overflow-y-auto pr-3';

function LevelsTab({ game }: { game: GamificationProgress }) {
  const percent =
    game.nextLevelXp === null
      ? 100
      : ((game.xp - game.levelStartXp) / (game.nextLevelXp - game.levelStartXp)) * 100;
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">
            Level {game.level} · {levelTitle(game.level)}
          </p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {game.xp.toLocaleString()} XP
          </p>
        </div>
        <Progress value={percent} className="h-2" aria-label="Progress to the next level" />
        <p className="text-xs text-muted-foreground">
          {game.nextLevelXp === null
            ? 'You reached the top level'
            : `${(game.nextLevelXp - game.xp).toLocaleString()} XP to Level ${game.level + 1} · ${levelTitle(game.level + 1)}`}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_17rem]">
        <ol className="space-y-1">
          {LEVEL_XP.map((xp, index) => {
            const level = index + 1;
            const done = level < game.level;
            const current = level === game.level;
            return (
              <li
                key={level}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm',
                  current && 'bg-primary/10 ring-1 ring-primary/30',
                  !done && !current && 'text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                    done && 'bg-success/15 text-success',
                    current && 'bg-primary text-primary-foreground',
                    !done && !current && 'bg-muted'
                  )}
                >
                  {done ? (
                    <>
                      <Check className="size-3.5" aria-hidden />
                      <span className="sr-only">Level {level}, reached</span>
                    </>
                  ) : (
                    level
                  )}
                </span>
                <span className={cn('flex-1', current && 'font-medium')}>{levelTitle(level)}</span>
                {current && (
                  <Badge variant="secondary" size="sm">
                    You are here
                  </Badge>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {xp.toLocaleString()} XP
                </span>
              </li>
            );
          })}
        </ol>

        <div className="space-y-3">
          <p className="text-sm font-medium">How you earn XP</p>
          <p className="text-xs text-muted-foreground">
            Resolve a report to earn XP by its priority. Resolve it within {EARLY_RESOLVE_MINUTES}{' '}
            minutes of getting it and the XP counts twice. Each report counts once, even when it is
            reopened.
          </p>
          <div className="divide-y rounded-md border">
            {REPORT_PRIORITIES.map((priority) => (
              <div key={priority} className="flex items-center justify-between px-3 py-2">
                <ReportPriorityLabel priority={priority} />
                <span className="text-sm font-medium tabular-nums">
                  +{XP_BY_PRIORITY[priority]}
                </span>
              </div>
            ))}
          </div>
          <div className="divide-y rounded-md border">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Zap className="size-4 shrink-0 text-amber-500" aria-hidden />
                Resolved within {EARLY_RESOLVE_MINUTES} min
              </span>
              <span className="whitespace-nowrap text-sm font-medium">XP × 2</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageSquare className="size-4 shrink-0 text-sky-500" aria-hidden />
                Message to a reporter
              </span>
              <span className="text-sm font-medium tabular-nums">+{XP_PER_REPORTER_MESSAGE}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementProgress }) {
  const copy = ACHIEVEMENTS[achievement.id];
  const unlocked = achievement.unlockedAt !== undefined;
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center gap-2 rounded-lg border p-4 text-center',
        unlocked ? 'bg-card' : 'border-dashed bg-muted/20'
      )}
    >
      <AchievementBadge
        achievement={achievement.id}
        unlocked={unlocked}
        decorative
        className="size-20"
      />
      <p className={cn('mt-1 text-sm font-medium', !unlocked && 'text-muted-foreground')}>
        {copy.title}
        <span className="sr-only">{unlocked ? ', unlocked' : ', locked'}</span>
      </p>
      <p className="min-h-12 text-xs text-muted-foreground">{copy.description}</p>
      <div className="mt-auto w-full pt-2">
        {unlocked ? (
          <p className="flex items-center justify-center gap-1 text-2xs text-muted-foreground">
            <Check className="size-3 text-success" aria-hidden />
            <span className="sr-only">Unlocked on </span>
            {formatDay(achievement.unlockedAt as string)}
          </p>
        ) : (
          <div className="space-y-1">
            <Progress
              value={(achievement.current / achievement.target) * 100}
              className="h-1"
              aria-label={`${copy.title} progress`}
            />
            <p className="text-2xs tabular-nums text-muted-foreground">
              {achievement.current} / {achievement.target}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AchievementGrid({ achievements }: { achievements: AchievementProgress[] }) {
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-4">
      {achievements.map((achievement) => (
        <AchievementCard key={achievement.id} achievement={achievement} />
      ))}
    </div>
  );
}

/** Levels, Achievements and Team, shared by the dashboard dialog and the profile */
export function HunterLogTabs({
  game,
  tab,
  onTabChange,
  className,
  panelClassName = 'mt-4',
}: {
  game: GamificationProgress;
  tab: ProgressTab;
  onTabChange: (tab: ProgressTab) => void;
  className?: string;
  panelClassName?: string;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as ProgressTab)}
      className={cn('flex flex-col', className)}
    >
      <TabsList className="self-start">
        <TabsTrigger value="levels">Levels</TabsTrigger>
        <TabsTrigger value="achievements">Achievements</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="levels" className={panelClassName}>
        <LevelsTab game={game} />
      </TabsContent>
      <TabsContent value="achievements" className={panelClassName}>
        <AchievementGrid achievements={game.achievements} />
      </TabsContent>
      <TabsContent value="team" className={panelClassName}>
        <TeamTab />
      </TabsContent>
    </Tabs>
  );
}

export function ProgressDialog({
  game,
  tab,
  onTabChange,
  open,
  onOpenChange,
}: {
  game: GamificationProgress;
  tab: ProgressTab;
  onTabChange: (tab: ProgressTab) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const unlocked = game.achievements.filter((item) => item.unlockedAt).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(42rem,calc(100dvh-2rem))] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Hunter&apos;s log</DialogTitle>
          <DialogDescription>
            Level {game.level} · {levelTitle(game.level)} · {unlocked} of {game.achievements.length}{' '}
            achievements
          </DialogDescription>
        </DialogHeader>
        <HunterLogTabs
          game={game}
          tab={tab}
          onTabChange={onTabChange}
          className="min-h-0 flex-1"
          panelClassName={TAB_PANEL}
        />
      </DialogContent>
    </Dialog>
  );
}

export function UnlockDialog({
  achievementId,
  onClose,
}: {
  achievementId: AchievementId | null;
  onClose: () => void;
}) {
  const copy = achievementId ? ACHIEVEMENTS[achievementId] : null;
  return (
    <Dialog open={copy !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          {achievementId && (
            <AchievementBadge
              achievement={achievementId}
              unlocked
              decorative
              className="mb-2 size-24"
            />
          )}
          <DialogTitle>Achievement unlocked: {copy?.title}</DialogTitle>
          <DialogDescription className="text-center">{copy?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button onClick={onClose}>Keep going</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
