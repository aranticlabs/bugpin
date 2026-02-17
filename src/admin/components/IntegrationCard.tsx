import { Integration, GitHubIntegrationConfig } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Github, Edit, Trash2, PlayCircle, Power, Clock } from 'lucide-react';

interface IntegrationCardProps {
  integration: Integration;
  onEdit: (integration: Integration) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

export function IntegrationCard({
  integration,
  onEdit,
  onDelete,
  onTest,
  onToggleActive,
}: IntegrationCardProps) {
  // Get integration type icon
  const getTypeIcon = () => {
    switch (integration.type) {
      case 'github':
        return <Github className="h-5 w-5" />;
      default:
        return null;
    }
  };

  // Get config details to display (masked)
  const getConfigDetails = () => {
    switch (integration.type) {
      case 'github': {
        const config = integration.config as GitHubIntegrationConfig;
        return (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium">Repository:</span> {config.owner}/{config.repo}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Token:</span> {config.accessToken}
            </p>
            {config.labels && config.labels.length > 0 && (
              <p className="text-muted-foreground">
                <span className="font-medium">Labels:</span> {config.labels.join(', ')}
              </p>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  // Format last used date
  const formatLastUsed = () => {
    if (!integration.lastUsedAt) return 'Never used';
    const date = new Date(integration.lastUsedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {getTypeIcon()}
            </div>
            <div>
              <CardTitle className="text-lg">{integration.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={`text-xs ${integration.isActive ? 'status-active' : 'status-inactive'}`}
                >
                  {integration.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {integration.type}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {getConfigDetails()}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last used: {formatLastUsed()}</span>
          <span className="ml-2">
            ({integration.usageCount} time{integration.usageCount !== 1 ? 's' : ''})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onEdit(integration)}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => onTest(integration.id)}>
            <PlayCircle className="h-4 w-4 mr-1" />
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleActive(integration.id, !integration.isActive)}
          >
            <Power className="h-4 w-4 mr-1" />
            {integration.isActive ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="ghost-destructive" size="sm" onClick={() => onDelete(integration.id)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
