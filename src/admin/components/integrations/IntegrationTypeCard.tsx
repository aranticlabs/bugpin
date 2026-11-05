import { Integration } from '@shared/types';
import { IntegrationTypeDefinition } from '../../lib/integration-types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Edit, Trash2, PlayCircle, Power, Clock } from 'lucide-react';

interface IntegrationTypeCardProps {
  definition: IntegrationTypeDefinition;
  integration?: Integration;
  onSetup: (definition: IntegrationTypeDefinition) => void;
  onEdit: (integration: Integration, definition: IntegrationTypeDefinition) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

function formatLastUsed(lastUsedAt?: string): string {
  if (!lastUsedAt) return 'Never used';
  const date = new Date(lastUsedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export function IntegrationTypeCard({
  definition,
  integration,
  onSetup,
  onEdit,
  onDelete,
  onTest,
  onToggleActive,
}: IntegrationTypeCardProps) {
  const Icon = definition.icon;

  if (!integration) {
    return (
      <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">{definition.name}</p>
            <p className="text-xs text-muted-foreground">{definition.description}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => onSetup(definition)}
        >
          Connect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{integration.name}</p>
          <Badge
            variant="outline"
            className={`text-xs ${integration.isActive ? 'status-active' : 'status-inactive'}`}
          >
            {integration.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {definition.getConfigSummary(integration)}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>Last used: {formatLastUsed(integration.lastUsedAt)}</span>
        <span className="ml-2">
          ({integration.usageCount} time{integration.usageCount !== 1 ? 's' : ''})
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(integration, definition)}>
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
        <Button variant="outline-destructive" size="sm" onClick={() => onDelete(integration.id)}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}
