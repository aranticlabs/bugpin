import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { EmailTemplates } from './EmailTemplates';
import { SMTP } from './SMTP';

export function EmailSettings() {
  return (
    <Tabs defaultValue="smtp" className="space-y-6">
      <TabsList>
        <TabsTrigger value="smtp">SMTP</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
      </TabsList>
      <TabsContent value="smtp" className="mt-0">
        <SMTP />
      </TabsContent>
      <TabsContent value="templates" className="mt-0">
        <EmailTemplates />
      </TabsContent>
    </Tabs>
  );
}
