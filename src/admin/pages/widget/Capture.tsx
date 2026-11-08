import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Diagnostics } from './Diagnostics';
import { Recording } from './Recording';
import { Screenshot } from './Screenshot';

export function Capture() {
  // All tabs stay mounted so unsaved edits survive switching tabs.
  return (
    <Tabs defaultValue="screenshot" className="space-y-6">
      <TabsList>
        <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
        <TabsTrigger value="recording">Recording</TabsTrigger>
        <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
      </TabsList>
      <TabsContent value="screenshot" forceMount className="mt-0">
        <Screenshot />
      </TabsContent>
      <TabsContent value="recording" forceMount className="mt-0">
        <Recording />
      </TabsContent>
      <TabsContent value="diagnostics" forceMount className="mt-0">
        <Diagnostics />
      </TabsContent>
    </Tabs>
  );
}
