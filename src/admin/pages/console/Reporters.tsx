import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { LoadError } from '../../components/dashboard/LoadError';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Spinner } from '../../components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import type { ReporterSummary } from '@shared/reporter-types';

interface ReporterPage {
  reporters: ReporterSummary[];
  nextCursor: string | null;
  total: number;
}
type ReporterStatus = 'all' | 'active' | 'suspended';
type ReporterAction = 'suspend' | 'unsuspend' | 'revoke-sessions' | 'delete';
const actionLabels: Record<ReporterAction, string> = {
  suspend: 'Suspend reporter',
  unsuspend: 'Unsuspend reporter',
  'revoke-sessions': 'Revoke sessions',
  delete: 'Delete reporter',
};
const actionDescriptions: Record<ReporterAction, string> = {
  suspend:
    'Revokes all sessions and outstanding login links. Further logins are blocked until this reporter is unsuspended.',
  unsuspend:
    'Allows this reporter to request a new login link. Previously revoked sessions and links stay invalid.',
  'revoke-sessions':
    'Revokes all sessions and outstanding login links. The reporter can request a new login link.',
  delete:
    'Permanently deletes this reporter account and removes ownership and claimability from existing reports. Messages remain with an anonymous author.',
};

export function Reporters() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ReporterStatus>('all');
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [confirmation, setConfirmation] = useState<{
    reporter: ReporterSummary;
    action: ReporterAction;
  } | null>(null);
  const [eraseContactDetails, setEraseContactDetails] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['reporters', { search, status }],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<ReporterPage>('/reporters', {
          params: {
            search: search || undefined,
            status: status === 'all' ? undefined : status,
            cursor: pageParam || undefined,
            limit: 25,
          },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const action = useMutation({
    mutationFn: async ({
      reporter,
      action: operation,
    }: {
      reporter: ReporterSummary;
      action: ReporterAction;
    }) =>
      operation === 'delete'
        ? api.delete(`/reporters/${reporter.id}`, { data: { eraseContactDetails } })
        : api.post(`/reporters/${reporter.id}/${operation}`),
    onSuccess: () => {
      setConfirmation(null);
      for (const queryKey of [
        ['reporters'],
        ['report'],
        ['reports'],
        ['report-history'],
        ['reporterMessages'],
      ])
        void queryClient.invalidateQueries({ queryKey });
      toast.success('Reporter updated');
    },
  });
  const reporters = query.data?.pages.flatMap((page) => page.reporters) ?? [];
  const total = query.data?.pages[0]?.total;

  return (
    <div className="min-w-0 space-y-4">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="reporter-search">Search reporters</Label>
          <Input
            id="reporter-search"
            value={searchInput}
            maxLength={200}
            placeholder="Email or display name"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        <div className="space-y-2">
          <Label htmlFor="reporter-status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              if (value === 'all' || value === 'active' || value === 'suspended') setStatus(value);
            }}
          >
            <SelectTrigger id="reporter-status" className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>
      {query.isError && (
        <LoadError
          what="reporters"
          onRetry={() =>
            void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
          }
        />
      )}
      <Card className="min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Reports</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Spinner className="mx-auto" />
                  <span className="sr-only">Loading reporters</span>
                </TableCell>
              </TableRow>
            ) : reporters.length === 0 && !query.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <p className="font-medium">
                    {search || status !== 'all' ? 'No matching reporters' : 'No reporters yet'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {search || status !== 'all'
                      ? 'Try another email, display name, or status.'
                      : 'Reporters appear here after they sign in to the reporter portal.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              reporters.map((reporter) => (
                <TableRow key={reporter.id}>
                  <TableCell className="max-w-60 truncate" title={reporter.email}>
                    {reporter.email}
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={reporter.displayName}>
                    {reporter.displayName}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <div className="flex flex-wrap gap-1">
                      {reporter.projects.length ? (
                        reporter.projects.map((project) => (
                          <Badge key={project.id} variant="secondary" className="max-w-full">
                            <span className="truncate" title={project.name}>
                              {project.name}
                            </span>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">No projects</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="text-primary hover:underline"
                      to={`/reports?reporterId=${encodeURIComponent(reporter.id)}&view=list`}
                      aria-label={`View reports by ${reporter.email}`}
                    >
                      {reporter.ownedReportCount}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {reporter.lastLoginAt ? formatDateTime(reporter.lastLoginAt) : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={reporter.status === 'active' ? 'status-active' : 'status-inactive'}
                    >
                      {reporter.status === 'active' ? 'Active' : 'Suspended'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${reporter.email}`}
                          onFocus={(event) => {
                            returnFocus.current = event.currentTarget;
                          }}
                          onPointerDown={(event) => {
                            returnFocus.current = event.currentTarget;
                          }}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(
                          [
                            reporter.status === 'suspended' ? 'unsuspend' : 'suspend',
                            'revoke-sessions',
                            'delete',
                          ] as const
                        ).map((operation) => (
                          <DropdownMenuItem
                            key={operation}
                            className={operation === 'delete' ? 'text-destructive' : undefined}
                            onSelect={() => {
                              action.reset();
                              setEraseContactDetails(false);
                              setConfirmation({ reporter, action: operation });
                            }}
                          >
                            {actionLabels[operation]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {total !== undefined && (
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'reporter' : 'reporters'}
        </p>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      )}
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !action.isPending) setConfirmation(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else document.getElementById('reporter-search')?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation && actionLabels[confirmation.action]}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation && actionDescriptions[confirmation.action]}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all text-sm font-medium">{confirmation?.reporter.email}</p>
          {confirmation?.action === 'delete' && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="erase-reporter-contact"
                checked={eraseContactDetails}
                disabled={action.isPending}
                onCheckedChange={(checked) => setEraseContactDetails(checked === true)}
              />
              <Label htmlFor="erase-reporter-contact" className="leading-normal">
                Also erase contact names and emails from formerly owned reports
              </Label>
            </div>
          )}
          {action.isError && (
            <p role="alert" className="text-sm text-destructive">
              {getApiErrorMessage(action.error, 'Failed to update reporter')}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={
                confirmation?.action === 'delete' ||
                confirmation?.action === 'suspend' ||
                confirmation?.action === 'revoke-sessions'
                  ? 'destructive'
                  : 'default'
              }
              disabled={action.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirmation && !action.isPending) action.mutate(confirmation);
              }}
            >
              {action.isPending ? 'Updating...' : confirmation && actionLabels[confirmation.action]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
