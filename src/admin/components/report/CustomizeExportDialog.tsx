import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { Report } from '@shared/types';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { downloadTextFile } from '../../lib/reportDownload';
import {
  byteSize,
  defaultRedactionToggles,
  defaultSectionToggles,
  exportFilename,
  formatByteSize,
  formatLabel,
  formatMimeType,
  renderExport,
  sectionCount,
  type ExportFormat,
  type ExportOptions,
  type ExportRedactionToggles,
  type ExportSection,
  type ExportSectionToggles,
} from '../../lib/reportExport';
import type { ExportAction } from './ExportDiagnosticsMenu';

const SECTION_OPTIONS: Array<{ key: ExportSection; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'environment', label: 'Environment' },
  { key: 'page', label: 'Page context' },
  { key: 'console', label: 'Console output' },
  { key: 'network', label: 'Network errors' },
  { key: 'userActivity', label: 'User activity' },
  { key: 'storageKeys', label: 'Storage keys' },
  { key: 'reporter', label: 'Reporter info' },
];

const FORMAT_OPTIONS: ExportFormat[] = ['markdown', 'plain', 'aiPrompt', 'json'];

interface CustomizeExportDialogProps {
  report: Report;
  permalink: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExported?: (format: ExportFormat, action: ExportAction) => void;
}

export function CustomizeExportDialog({
  report,
  permalink,
  open,
  onOpenChange,
  onExported,
}: CustomizeExportDialogProps) {
  const [sections, setSections] = useState<ExportSectionToggles>(defaultSectionToggles());
  const [redactions, setRedactions] = useState<ExportRedactionToggles>(defaultRedactionToggles());
  const [format, setFormat] = useState<ExportFormat>('markdown');

  useEffect(() => {
    if (open) {
      setSections(defaultSectionToggles());
      setRedactions(defaultRedactionToggles());
      setFormat('markdown');
    }
  }, [open]);

  const options = useMemo<ExportOptions>(
    () => ({ sections, redactions, permalink }),
    [sections, redactions, permalink]
  );

  const preview = useMemo(() => renderExport(report, format, options), [report, format, options]);
  const previewBytes = useMemo(() => byteSize(preview), [preview]);

  const toggleSection = useCallback((key: ExportSection) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleRedaction = useCallback((key: keyof ExportRedactionToggles) => {
    setRedactions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(preview);
      toast.success(`Copied ${formatByteSize(previewBytes)} as ${formatLabel(format)}`);
      onExported?.(format, 'copy');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [format, onExported, preview, previewBytes]);

  const handleDownload = useCallback(() => {
    try {
      const filename = exportFilename(report.id, format);
      downloadTextFile(preview, filename, formatMimeType(format));
      toast.success(`Downloaded ${filename}`);
      onExported?.(format, 'download');
    } catch {
      toast.error('Failed to download file');
    }
  }, [format, onExported, preview, report.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Customize export</DialogTitle>
          <DialogDescription>
            Choose which sections to include and apply optional redactions before copying or
            downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
          <ScrollArea
            className="flex-1 md:flex-none md:w-80"
            contentClassName="flex flex-col gap-3"
          >
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Format</Label>
              <Tabs
                value={format}
                onValueChange={(value) => setFormat(value as ExportFormat)}
                className="mt-1.5"
              >
                <TabsList className="grid h-8 w-full grid-cols-4">
                  {FORMAT_OPTIONS.map((f) => (
                    <TabsTrigger key={f} value={f} className="text-xs">
                      {formatLabel(f)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Sections</Label>
              <div className="space-y-0.5">
                {SECTION_OPTIONS.map(({ key, label }) => {
                  const count = sectionCount(report, key);
                  const inputId = `customize-section-${key}`;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-primary-tint"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={inputId}
                          checked={sections[key]}
                          onCheckedChange={() => toggleSection(key)}
                        />
                        <label htmlFor={inputId} className="text-sm cursor-pointer select-none">
                          {label}
                        </label>
                      </div>
                      {count !== null && count > 0 && (
                        <span className="text-xs text-muted-foreground">{count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Redaction</Label>
              <div className="space-y-0.5">
                <RedactionToggle
                  id="customize-redact-querystring"
                  label="Strip query strings from URLs"
                  checked={redactions.stripQueryStrings}
                  onChange={() => toggleRedaction('stripQueryStrings')}
                />
                <RedactionToggle
                  id="customize-redact-console"
                  label="Truncate console output to last 100 lines"
                  checked={redactions.truncateConsole}
                  onChange={() => toggleRedaction('truncateConsole')}
                />
                <RedactionToggle
                  id="customize-redact-inputs"
                  label="Strip input values from user activity"
                  checked={redactions.stripInputValues}
                  onChange={() => toggleRedaction('stripInputValues')}
                />
              </div>
            </div>
          </ScrollArea>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground">Preview</Label>
              <span className="text-xs text-muted-foreground">
                {formatByteSize(previewBytes)} · {preview.length.toLocaleString()} chars
              </span>
            </div>
            <ScrollArea
              className="mt-2 flex-1 rounded-md border bg-muted/40"
              aria-label="Export preview"
            >
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">{preview}</pre>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RedactionToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}

function RedactionToggle({ id, label, checked, onChange }: RedactionToggleProps) {
  return (
    <div className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-primary-tint">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <label htmlFor={id} className="text-sm leading-tight cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}
