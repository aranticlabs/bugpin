import { ApiTokens } from './ApiTokens';
import { Privacy } from './Privacy';
import { Webhooks } from './Webhooks';
import { Settings } from './Settings';
import { Storage } from './Storage';
import { SMTP } from './SMTP';
import { SubPageTabs } from './SubPageTabs';

const SETTINGS_SUB_TABS = [
  { hash: 'general', label: 'General' },
  { hash: 'smtp', label: 'SMTP' },
  { hash: 'privacy', label: 'Privacy' },
  { hash: 'storage', label: 'Storage' },
  { hash: 'api-tokens', label: 'API' },
  { hash: 'webhooks', label: 'Webhooks' },
];

export function SettingsPage() {
  return (
    <div className="max-w-4xl">
      <SubPageTabs subTabs={SETTINGS_SUB_TABS} defaultHash="general">
        <Settings />
        <SMTP />
        <Privacy />
        <Storage />
        <ApiTokens />
        <Webhooks />
      </SubPageTabs>
    </div>
  );
}
