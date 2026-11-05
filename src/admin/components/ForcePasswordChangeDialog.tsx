import { useAuth } from '../contexts/AuthContext';
import { ChangePasswordForm } from './ChangePasswordForm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function ForcePasswordChangeDialog() {
  const { refreshUser } = useAuth();

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Change your password</DialogTitle>
          <DialogDescription>
            The initial password can only be used once. Choose a new password to continue.
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm onSuccess={refreshUser} />
      </DialogContent>
    </Dialog>
  );
}
