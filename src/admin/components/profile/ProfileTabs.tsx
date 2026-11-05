import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { AccountCard } from './AccountCard';
import { SecurityTab } from './SecurityTab';

const TAB_PARAM = 'tab';
const SECURITY_TAB = 'security';
const ACCOUNT_TAB = 'account';

export function ProfileTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get(TAB_PARAM) === SECURITY_TAB ? SECURITY_TAB : ACCOUNT_TAB;

  const changeTab = (next: string) => {
    setSearchParams(next === SECURITY_TAB ? { [TAB_PARAM]: SECURITY_TAB } : {}, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value={ACCOUNT_TAB}>Account</TabsTrigger>
        <TabsTrigger value={SECURITY_TAB}>Security</TabsTrigger>
      </TabsList>
      <TabsContent value={ACCOUNT_TAB} className="mt-0 space-y-6">
        <AccountCard />
      </TabsContent>
      <TabsContent value={SECURITY_TAB} className="mt-0 space-y-6">
        <SecurityTab />
      </TabsContent>
    </Tabs>
  );
}
