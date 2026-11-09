import { Columns3, List } from 'lucide-react';
import { REPORT_VIEWS, type ReportView } from '@shared/types';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

function isReportView(value: string): value is ReportView {
  return (REPORT_VIEWS as readonly string[]).includes(value);
}

export function ReportViewSwitcher({
  value,
  onChange,
  labels = { view: 'Report view', list: 'List', board: 'Board' },
}: {
  value: ReportView;
  onChange: (view: ReportView) => void;
  labels?: { view: string; list: string; board: string };
}) {
  return (
    <Tabs value={value} onValueChange={(next) => isReportView(next) && onChange(next)}>
      <TabsList aria-label={labels.view}>
        <TabsTrigger value="list" className="gap-1.5">
          <List className="h-4 w-4" />
          {labels.list}
        </TabsTrigger>
        <TabsTrigger value="board" className="gap-1.5">
          <Columns3 className="h-4 w-4" />
          {labels.board}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
