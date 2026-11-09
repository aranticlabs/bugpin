import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AdminRoute } from '../../components/AdminRoute';
import { Spinner } from '../../components/ui/spinner';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import { legacySettingsPath } from '../../lib/legacyRoutes';
import {
  SETTINGS_HOME_PATH,
  canOpenSettingsPage,
  canUseApiTokens,
  findSettingsNavItem,
} from '../../lib/settingsNavigation';

const ProfileTabs = lazyWithRetry(() =>
  import('../../components/profile/ProfileTabs').then((m) => ({ default: m.ProfileTabs }))
);
const MyNotificationsCard = lazyWithRetry(() =>
  import('../../components/profile/MyNotificationsCard').then((m) => ({
    default: m.MyNotificationsCard,
  }))
);
const ApiTokens = lazyWithRetry(() =>
  import('../console/ApiTokens').then((m) => ({ default: m.ApiTokens }))
);
const General = lazyWithRetry(() =>
  import('../console/Settings').then((m) => ({ default: m.Settings }))
);
const DataPrivacy = lazyWithRetry(() =>
  import('../console/DataPrivacy').then((m) => ({ default: m.DataPrivacy }))
);
const Storage = lazyWithRetry(() =>
  import('../console/Storage').then((m) => ({ default: m.Storage }))
);
const EmailSettings = lazyWithRetry(() =>
  import('../console/EmailSettings').then((m) => ({ default: m.EmailSettings }))
);
const Gamification = lazyWithRetry(() =>
  import('../console/Gamification').then((m) => ({ default: m.Gamification }))
);
const License = lazyWithRetry(() =>
  import('../console/License').then((m) => ({ default: m.License }))
);
const Users = lazyWithRetry(() => import('../console/Users').then((m) => ({ default: m.Users })));
const Reporters = lazyWithRetry(() =>
  import('../console/Reporters').then((m) => ({ default: m.Reporters }))
);
const UserDetail = lazyWithRetry(() =>
  import('./UserDetail').then((m) => ({ default: m.UserDetail }))
);
const InvitationSettings = lazyWithRetry(() =>
  import('../console/Security').then((m) => ({ default: m.InvitationSettingsCard }))
);
const SessionSettings = lazyWithRetry(() =>
  import('../console/Security').then((m) => ({ default: m.SessionSettingsCard }))
);
const TwoFactorPolicy = lazyWithRetry(() =>
  import('../console/Security').then((m) => ({ default: m.TwoFactorPolicyCard }))
);
const PasswordPolicy = lazyWithRetry(() =>
  import('../console/Security').then((m) => ({ default: m.PasswordPolicyCard }))
);
const NetworkSettings = lazyWithRetry(() =>
  import('../console/Security').then((m) => ({ default: m.NetworkSettingsCard }))
);
const WidgetButton = lazyWithRetry(() =>
  import('../widget/Button').then((m) => ({ default: m.Button }))
);
const WidgetDialog = lazyWithRetry(() =>
  import('../widget/Dialog').then((m) => ({ default: m.Dialog }))
);
const WidgetLanguage = lazyWithRetry(() =>
  import('../widget/Language').then((m) => ({ default: m.Language }))
);
const Capture = lazyWithRetry(() =>
  import('../widget/Capture').then((m) => ({ default: m.Capture }))
);
const NotificationDefaults = lazyWithRetry(() =>
  import('../console/NotificationDefaults').then((m) => ({ default: m.NotificationDefaults }))
);
const Branding = lazyWithRetry(() =>
  import('../console/Branding').then((m) => ({ default: m.Branding }))
);
const WhiteLabel = lazyWithRetry(() =>
  import('../console/WhiteLabelSettings').then((m) => ({ default: m.WhiteLabel }))
);

function SectionFallback() {
  return (
    <div className="flex justify-center py-12">
      <Spinner className="text-primary" />
    </div>
  );
}

function SettingsPage({
  children,
  adminOnly = false,
  wide = false,
  header = true,
}: {
  children: ReactNode;
  adminOnly?: boolean;
  wide?: boolean;
  header?: boolean;
}) {
  const { pathname } = useLocation();
  const current = header ? findSettingsNavItem(pathname)?.item : undefined;
  const page = (
    <div className={wide ? 'space-y-6' : 'max-w-4xl space-y-6'}>
      {current && (
        <div>
          <h2 className="text-xl font-semibold">{current.title}</h2>
          <p className="text-sm text-muted-foreground">{current.description}</p>
        </div>
      )}
      <Suspense fallback={<SectionFallback />}>{children}</Suspense>
    </div>
  );
  return adminOnly ? <AdminRoute>{page}</AdminRoute> : page;
}

function ApiTokensRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return canUseApiTokens(user) ? <>{children}</> : <Navigate to={SETTINGS_HOME_PATH} replace />;
}

function SettingsIndex() {
  const { user } = useAuth();
  const { hash } = useLocation();
  const target = legacySettingsPath('/settings', hash) ?? '/settings/general';
  if (user?.role === 'admin' || canOpenSettingsPage(user, target)) {
    return <Navigate to={target} replace />;
  }
  return <Navigate to={SETTINGS_HOME_PATH} replace />;
}

export function SettingsRouter() {
  return (
    <Routes>
      <Route index element={<SettingsIndex />} />
      <Route
        path="account/profile"
        element={
          <SettingsPage>
            <ProfileTabs />
          </SettingsPage>
        }
      />
      <Route
        path="account/notifications"
        element={
          <SettingsPage>
            <MyNotificationsCard />
          </SettingsPage>
        }
      />
      <Route
        path="account/api-tokens"
        element={
          <ApiTokensRoute>
            <SettingsPage>
              <ApiTokens />
            </SettingsPage>
          </ApiTokensRoute>
        }
      />
      <Route
        path="general"
        element={
          <SettingsPage adminOnly>
            <General />
          </SettingsPage>
        }
      />
      <Route
        path="data-privacy"
        element={
          <SettingsPage adminOnly>
            <DataPrivacy />
          </SettingsPage>
        }
      />
      <Route
        path="gamification"
        element={
          <SettingsPage adminOnly>
            <Gamification />
          </SettingsPage>
        }
      />
      <Route
        path="storage"
        element={
          <SettingsPage adminOnly>
            <Storage />
          </SettingsPage>
        }
      />
      <Route
        path="email"
        element={
          <SettingsPage adminOnly>
            <EmailSettings />
          </SettingsPage>
        }
      />
      <Route
        path="license"
        element={
          <SettingsPage adminOnly>
            <License />
          </SettingsPage>
        }
      />
      <Route
        path="users"
        element={
          <SettingsPage adminOnly header={false}>
            <Users />
            <InvitationSettings />
          </SettingsPage>
        }
      />
      <Route
        path="reporters"
        element={
          <SettingsPage adminOnly wide>
            <Reporters />
          </SettingsPage>
        }
      />
      <Route
        path="users/:id"
        element={
          <SettingsPage adminOnly header={false}>
            <UserDetail />
          </SettingsPage>
        }
      />
      <Route
        path="authentication"
        element={
          <SettingsPage adminOnly>
            <SessionSettings />
            <TwoFactorPolicy />
            <PasswordPolicy />
          </SettingsPage>
        }
      />
      <Route
        path="network"
        element={
          <SettingsPage adminOnly>
            <NetworkSettings />
          </SettingsPage>
        }
      />
      <Route
        path="project-defaults/launcher-button"
        element={
          <SettingsPage adminOnly wide>
            <WidgetButton />
          </SettingsPage>
        }
      />
      <Route
        path="project-defaults/dialog"
        element={
          <SettingsPage adminOnly wide>
            <WidgetDialog />
          </SettingsPage>
        }
      />
      <Route
        path="project-defaults/language"
        element={
          <SettingsPage adminOnly>
            <WidgetLanguage />
          </SettingsPage>
        }
      />
      <Route
        path="project-defaults/capture"
        element={
          <SettingsPage adminOnly>
            <Capture />
          </SettingsPage>
        }
      />
      <Route
        path="project-defaults/notifications"
        element={
          <SettingsPage adminOnly>
            <NotificationDefaults />
          </SettingsPage>
        }
      />
      <Route
        path="branding"
        element={
          <SettingsPage adminOnly>
            <Branding />
          </SettingsPage>
        }
      />
      <Route
        path="white-label"
        element={
          <SettingsPage adminOnly>
            <WhiteLabel />
          </SettingsPage>
        }
      />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
