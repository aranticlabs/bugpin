import { Integration } from '@shared/types';
import { IntegrationTypeDefinition } from '../../lib/integration-types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground mb-3">
            <Icon className="h-6 w-6" />
          </div>
          <h3 className="font-semibold">{definition.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">{definition.description}</p>
          <Button variant="outline" size="sm" onClick={() => onSetup(definition)}>
            Configure
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
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
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {definition.getConfigSummary(integration)}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last used: {formatLastUsed(integration.lastUsedAt)}</span>
          <span className="ml-2">
            ({integration.usageCount} time{integration.usageCount !== 1 ? 's' : ''})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
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
          <Button
            variant="outline-destructive"
            size="sm"
            onClick={() => onDelete(integration.id)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
