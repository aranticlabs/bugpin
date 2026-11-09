import { Columns3, List } from 'lucide-react';
import { REPORT_VIEWS, type ReportView } from '@shared/types';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

function isReportView(value: string): value is ReportView {
  return (REPORT_VIEWS as readonly string[]).includes(value);
}

export function ReportViewSwitcher({
  value,
  onChange,
  labels,
}: {
  value: ReportView;
  onChange: (view: ReportView) => void;
  labels?: Partial<{ view: string; list: string; board: string }>;
}) {
  const text = { view: 'Report view', list: 'List', board: 'Board', ...labels };
  return (
    <Tabs value={value} onValueChange={(next) => isReportView(next) && onChange(next)}>
      <TabsList aria-label={text.view}>
        <TabsTrigger value="list" className="gap-1.5">
          <List className="h-4 w-4" />
          {text.list}
        </TabsTrigger>
        <TabsTrigger value="board" className="gap-1.5">
          <Columns3 className="h-4 w-4" />
          {text.board}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
