import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { EmailTemplates } from './EmailTemplates';
import { SMTP } from './SMTP';

export function EmailSettings() {
  // Both tabs stay mounted so unsaved edits survive switching tabs.
  return (
    <Tabs defaultValue="smtp" className="space-y-6">
      <TabsList>
        <TabsTrigger value="smtp">SMTP</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
      </TabsList>
      <TabsContent value="smtp" forceMount className="mt-0">
        <SMTP />
      </TabsContent>
      <TabsContent value="templates" forceMount className="mt-0">
        <EmailTemplates />
      </TabsContent>
    </Tabs>
  );
}
