import { useState } from 'react';
import {
  useIntegrations,
  useDeleteIntegration,
  useUpdateIntegration,
  useTestIntegration,
} from '../../hooks/useIntegrations';
import { Integration } from '@shared/types';
import { IntegrationTypeCard } from '../integrations/IntegrationTypeCard';
import {
  CE_INTEGRATION_TYPES,
  IntegrationTypeDefinition,
} from '../../lib/integration-types';

import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
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
import { Spinner } from '../ui/spinner';

interface ProjectIntegrationsDialogProps {
  project: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationTypes?: IntegrationTypeDefinition[];
}

export function ProjectIntegrationsDialog({
  project,
  open,
  onOpenChange,
  integrationTypes = CE_INTEGRATION_TYPES,
}: ProjectIntegrationsDialogProps) {
  const [activeType, setActiveType] = useState<IntegrationTypeDefinition | null>(null);
  const [editingIntegration, setEditingIntegration] = useState<Integration | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<string | null>(null);

  const deleteMutation = useDeleteIntegration();
  const updateMutation = useUpdateIntegration();
  const testMutation = useTestIntegration();

  const { data: integrations, isLoading } = useIntegrations(project.id);

  const handleSetup = (definition: IntegrationTypeDefinition) => {
    setEditingIntegration(undefined);
    setActiveType(definition);
  };

  const handleEdit = (integration: Integration, definition: IntegrationTypeDefinition) => {
    setEditingIntegration(integration);
    setActiveType(definition);
  };

  const handleConfigDialogClose = () => {
    setActiveType(null);
    setEditingIntegration(undefined);
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
    await testMutation.mutateAsync(id).catch(() => {});
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await updateMutation.mutateAsync({
      id,
      data: { isActive },
    });
  };

  const ActiveConfigDialog = activeType?.ConfigDialog;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`max-h-[85vh] ${integrationTypes.length > 1 ? 'max-w-3xl' : 'max-w-lg'}`}>
          <DialogHeader>
            <DialogTitle>Integrations</DialogTitle>
            <DialogDescription>Manage integrations for "{project.name}"</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Spinner size="lg" className="text-primary" />
              </div>
            ) : (
              <div className={`grid gap-4 ${integrationTypes.length > 1 ? 'md:grid-cols-2' : ''}`}>
                {integrationTypes.map((definition) => {
                  const integration = integrations?.find((i) => i.type === definition.type);
                  return (
                    <IntegrationTypeCard
                      key={definition.type}
                      definition={definition}
                      integration={integration}
                      onSetup={handleSetup}
                      onEdit={handleEdit}
                      onDelete={handleDeleteIntegration}
                      onTest={handleTestIntegration}
                      onToggleActive={handleToggleActive}
                    />
                  );
                })}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {ActiveConfigDialog && (
        <ActiveConfigDialog
          open={!!activeType}
          onClose={handleConfigDialogClose}
          integration={editingIntegration}
          projectId={project.id}
        />
      )}

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
