import { useState } from 'react';
import {
  useIntegrations,
  useDeleteIntegration,
  useUpdateIntegration,
  useTestIntegration,
} from '../../hooks/useIntegrations';
import { Integration } from '@shared/types';
import { IntegrationCard } from '../IntegrationCard';
import { IntegrationDialog } from '../IntegrationDialog';
import { Button } from '../ui/button';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Plus, PackageOpen } from 'lucide-react';
import { Spinner } from '../ui/spinner';

interface ProjectIntegrationsDialogProps {
  project: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectIntegrationsDialog({
  project,
  open,
  onOpenChange,
}: ProjectIntegrationsDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<string | null>(null);

  const deleteMutation = useDeleteIntegration();
  const updateMutation = useUpdateIntegration();
  const testMutation = useTestIntegration();

  // Load integrations for the project
  const { data: integrations, isLoading } = useIntegrations(project.id);

  // CE only supports one GitHub integration per project
  const hasGitHubIntegration = integrations?.some((i) => i.type === 'github') ?? false;

  const handleAddIntegration = () => {
    setEditingIntegration(undefined);
    setDialogOpen(true);
  };

  const handleEditIntegration = (integration: Integration) => {
    setEditingIntegration(integration);
    setDialogOpen(true);
  };

  const handleDeleteIntegration = (id: string) => {
    setIntegrationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (integrationToDelete) {
      await deleteMutation.mutateAsync(integrationToDelete);
      setDeleteDialogOpen(false);
      setIntegrationToDelete(null);
    }
  };

  const handleTestIntegration = async (id: string) => {
    // Toast is handled by the useTestIntegration hook
    await testMutation.mutateAsync(id).catch(() => {});
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await updateMutation.mutateAsync({
      id,
      data: { isActive },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle>Integrations</DialogTitle>
                <DialogDescription>Manage integrations for "{project.name}"</DialogDescription>
              </div>
              {!hasGitHubIntegration && (
                <Button onClick={handleAddIntegration} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Integration
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Spinner size="lg" className="text-primary" />
              </div>
            ) : integrations && integrations.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {integrations.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onEdit={handleEditIntegration}
                    onDelete={handleDeleteIntegration}
                    onTest={handleTestIntegration}
                    onToggleActive={handleToggleActive}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <PackageOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No integrations configured</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first integration to forward bug reports to external services
                </p>
                <Button onClick={handleAddIntegration}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Integration
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Integration Dialog */}
      <IntegrationDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingIntegration(undefined);
        }}
        integration={editingIntegration}
        projectId={project.id}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this integration? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} variant="destructive">
              {deleteMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
