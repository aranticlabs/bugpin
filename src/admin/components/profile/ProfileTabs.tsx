import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { AccountCard } from './AccountCard';
import { HuntersLogTab } from './HuntersLogTab';
import { SecurityTab } from './SecurityTab';
import { useGamificationSelf } from '../../hooks/useDashboard';

const TAB_PARAM = 'tab';
const ACCOUNT_TAB = 'account';
const SECURITY_TAB = 'security';
const HUNTERS_LOG_TAB = 'hunters-log';

export function ProfileTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: gamification } = useGamificationSelf();
  const showHuntersLog = gamification?.available === true;
  const requested = searchParams.get(TAB_PARAM);
  const tab =
    requested === SECURITY_TAB || (requested === HUNTERS_LOG_TAB && showHuntersLog)
      ? requested
      : ACCOUNT_TAB;

  const changeTab = (next: string) => {
    setSearchParams(next === ACCOUNT_TAB ? {} : { [TAB_PARAM]: next }, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value={ACCOUNT_TAB}>Account</TabsTrigger>
        <TabsTrigger value={SECURITY_TAB}>Security</TabsTrigger>
        {showHuntersLog && <TabsTrigger value={HUNTERS_LOG_TAB}>Hunter&apos;s log</TabsTrigger>}
      </TabsList>
      <TabsContent value={ACCOUNT_TAB} className="mt-0 space-y-6">
        <AccountCard />
      </TabsContent>
      <TabsContent value={SECURITY_TAB} className="mt-0 space-y-6">
        <SecurityTab />
      </TabsContent>
      {showHuntersLog && (
        <TabsContent value={HUNTERS_LOG_TAB} className="mt-0">
          <HuntersLogTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
