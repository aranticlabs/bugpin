import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  ReportPriorityLabel,
  ReportStatusIcon,
  ReportStatusLabel,
} from '../../components/report/ReportStatusPriority';
import { Spinner } from '../../components/ui/spinner';
import { reportOriginState } from '../../lib/reportOrigin';
import { ClipboardList } from 'lucide-react';

interface DashboardStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

export function Dashboard() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/reports/stats/overview');
      return response.data.stats as DashboardStats;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const { data: recentReports, isLoading: reportsLoading } = useQuery({
    queryKey: ['recent-reports'],
    queryFn: async () => {
      const response = await api.get('/reports', { params: { limit: 5 } });
      return response.data.data;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" className="text-primary" />
      </div>
    );
  }

  const stats = statsData || {
    total: 0,
    byStatus: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
    byPriority: { lowest: 0, low: 0, medium: 0, high: 0, highest: 0 },
  };

  const openReports = (stats.byStatus.open || 0) + (stats.byStatus.in_progress || 0);
  const resolvedReports = (stats.byStatus.resolved || 0) + (stats.byStatus.closed || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your bug reports</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Reports"
          value={stats.total}
          icon={<ClipboardList className="size-5" />}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatCard
          title="Open"
          value={openReports}
          icon={<ReportStatusIcon status="open" className="size-5" />}
          iconClassName="bg-sky-500/10"
        />
        <StatCard
          title="In Progress"
          value={stats.byStatus.in_progress || 0}
          icon={<ReportStatusIcon status="in_progress" className="size-5" />}
          iconClassName="bg-indigo-500/10"
        />
        <StatCard
          title="Resolved"
          value={resolvedReports}
          icon={<ReportStatusIcon status="resolved" className="size-5" />}
          iconClassName="bg-emerald-500/10"
        />
      </div>

      {/* Recent reports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <CardTitle className="text-lg font-medium">Recent Reports</CardTitle>
          <Link to="/reports" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {reportsLoading ? (
              <div className="p-6 text-center text-muted-foreground">Loading...</div>
            ) : recentReports?.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No reports yet</div>
            ) : (
              recentReports?.map((report: ReportItem) => (
                <Link
                  key={report.id}
                  to={`/reports/${report.id}`}
                  state={reportOriginState({ path: '/', label: 'Dashboard' })}
                  className="block px-6 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{report.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {report.metadata?.url}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 sm:ml-4 sm:shrink-0">
                      <ReportStatusLabel status={report.status} />
                      <ReportPriorityLabel priority={report.priority} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ReportItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  metadata?: { url?: string };
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon,
  iconClassName,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  iconClassName: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${iconClassName}`}>{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
