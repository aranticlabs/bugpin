import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Spinner } from '../components/ui/spinner';
import { ClipboardList, Clock, CheckCircle, Zap } from 'lucide-react';

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
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
  });

  const { data: recentReports, isLoading: reportsLoading } = useQuery({
    queryKey: ['recent-reports'],
    queryFn: async () => {
      const response = await api.get('/reports', { params: { limit: 5 } });
      return response.data.data;
    },
    refetchInterval: 1000,
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
          icon={<ClipboardList className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="Open"
          value={openReports}
          icon={<Clock className="h-5 w-5" />}
          variant="blue"
        />
        <StatCard
          title="In Progress"
          value={stats.byStatus.in_progress || 0}
          icon={<Zap className="h-5 w-5" />}
          variant="yellow"
        />
        <StatCard
          title="Resolved"
          value={resolvedReports}
          icon={<CheckCircle className="h-5 w-5" />}
          variant="green"
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
                  className="block px-6 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{report.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {report.metadata?.url}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <StatusBadge status={report.status} />
                      <PriorityBadge priority={report.priority} />
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
  variant,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  variant: 'default' | 'blue' | 'green' | 'yellow';
}) {
  const iconClasses = {
    default: 'bg-primary/10 text-primary',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${iconClasses[variant]}`}>{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  return (
    <Badge variant="outline" className={`status-${status}`}>
      {labels[status] || status}
    </Badge>
  );
}

// Priority Badge Component
function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={`priority-${priority} uppercase text-xs`}>
      {priority}
    </Badge>
  );
}
