import { Privacy } from './Privacy';
import { Security } from './Security';
import { SubPageTabs } from './SubPageTabs';

const SUB_TABS = [
  { hash: 'security', label: 'Security' },
  { hash: 'privacy', label: 'Privacy' },
];

export function SecurityPrivacy() {
  return (
    <SubPageTabs subTabs={SUB_TABS} defaultHash="security">
      <Security />
      <Privacy />
    </SubPageTabs>
  );
}
