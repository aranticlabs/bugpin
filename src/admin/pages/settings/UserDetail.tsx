import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadError } from '../../components/dashboard/LoadError';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { ConfirmActionDialog, type Confirmation } from '../../components/users/ConfirmActionDialog';
import { UserAccountSection } from '../../components/users/UserAccountSection';
import { UserApiAccessSection } from '../../components/users/UserApiAccessSection';
import { UserDeleteSection } from '../../components/users/UserDeleteSection';
import { UserDetailHeader } from '../../components/users/UserDetailHeader';
import { UserGamificationSection } from '../../components/users/UserGamificationSection';
import { UserRoleSection } from '../../components/users/UserRoleSection';
import { UserSignInSection } from '../../components/users/UserSignInSection';
import { useUsers } from '../../components/users/useUsers';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const { data: users, isLoading, isError, refetch } = useUsers();
  const user = users?.find((candidate) => candidate.id === id);

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/settings/users">
        <ArrowLeft />
        All Users
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!users && isError) {
    return (
      <>
        {backLink}
        <Card>
          <LoadError what="this user" onRetry={() => void refetch()} />
        </Card>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {backLink}
        <Alert>
          <AlertDescription>This user does not exist or was deleted.</AlertDescription>
        </Alert>
      </>
    );
  }

  const isSelf = user.id === currentUser?.id;

  return (
    <>
      {backLink}
      <UserDetailHeader user={user} isSelf={isSelf} />
      <UserAccountSection user={user} />
      <UserRoleSection user={user} isSelf={isSelf} confirm={setConfirmation} />
      <UserSignInSection user={user} isSelf={isSelf} confirm={setConfirmation} />
      <UserApiAccessSection user={user} confirm={setConfirmation} />
      <UserGamificationSection user={user} />
      <UserDeleteSection user={user} isSelf={isSelf} confirm={setConfirmation} />
      <ConfirmActionDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </>
  );
}
