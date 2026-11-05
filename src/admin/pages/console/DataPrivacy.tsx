import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { DeleteAllData } from './DeleteAllData';
import { Privacy } from './Privacy';
import { DataRetention } from './Settings';

export function DataPrivacy() {
  return (
    <Tabs defaultValue="privacy" className="max-w-4xl space-y-6">
      <TabsList>
        <TabsTrigger value="privacy">Privacy</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
      </TabsList>
      <TabsContent value="privacy" className="mt-0">
        <Privacy />
      </TabsContent>
      <TabsContent value="data" className="mt-0 space-y-6">
        <DataRetention />
        <DeleteAllData />
      </TabsContent>
    </Tabs>
  );
}
