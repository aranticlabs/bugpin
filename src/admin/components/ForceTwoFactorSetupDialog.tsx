import { useAuth } from '../contexts/AuthContext';
import { TwoFactorCard } from './profile/SecurityTab';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export function ForceTwoFactorSetupDialog() {
  const { logout } = useAuth();

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Set up two-factor authentication</DialogTitle>
          <DialogDescription>
            Your administrator requires a second sign-in step for your account. Set up a method to
            continue.
          </DialogDescription>
        </DialogHeader>
        <TwoFactorCard />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
