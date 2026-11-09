import { PasswordPolicySettings, Security, TwoFactor } from './Security';
import { SubPageTabs } from './SubPageTabs';

const SUB_TABS = [
  { hash: 'general', label: 'General' },
  { hash: 'two-factor', label: 'Two-Factor' },
  { hash: 'password-policy', label: 'Password Policy' },
];

export function SecurityPrivacy() {
  return (
    <SubPageTabs subTabs={SUB_TABS} defaultHash="general">
      <Security />
      <TwoFactor />
      <PasswordPolicySettings />
    </SubPageTabs>
  );
}
