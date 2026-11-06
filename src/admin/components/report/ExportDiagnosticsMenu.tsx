import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Copy, Download, FileCode, FileJson, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ExportAction, Report, UserPreferences } from '@shared/types';
import { usePreference } from '../../hooks/useUserPreferences';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { downloadTextFile } from '../../lib/reportDownload';
import {
  buildPermalink,
  byteSize,
  defaultExportOptions,
  exportFilename,
  formatByteSize,
  formatExtension,
  formatLabel,
  formatMimeType,
  renderExport,
  type ExportFormat,
} from '../../lib/reportExport';
import { CustomizeExportDialog } from './CustomizeExportDialog';

export type { ExportAction };

type LastUsed = NonNullable<UserPreferences['lastExport']>;

interface ExportDiagnosticsMenuProps {
  report: Report;
}

const FORMAT_ROWS: Array<{ format: ExportFormat; icon: typeof FileText }> = [
  { format: 'markdown', icon: FileCode },
  { format: 'plain', icon: FileText },
  { format: 'aiPrompt', icon: Sparkles },
  { format: 'json', icon: FileJson },
];

function parseLegacyLastUsed(raw: string): LastUsed | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<LastUsed>;
    return parsed.format && parsed.action ? (parsed as LastUsed) : undefined;
  } catch {
    return undefined;
  }
}

export function ExportDiagnosticsMenu({ report }: ExportDiagnosticsMenuProps) {
  const [open, setOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [lastUsed, setLastUsed] = usePreference('lastExport', null, {
    legacyKey: 'bugpin:export-diagnostics:last-used',
    parseLegacy: parseLegacyLastUsed,
  });

  const permalink = useMemo(() => buildPermalink(report.id), [report.id]);

  const persistLastUsed = useCallback(
    (format: ExportFormat, action: ExportAction) => setLastUsed({ format, action }),
    [setLastUsed]
  );

  const handleCopy = useCallback(
    async (format: ExportFormat) => {
      try {
        const options = defaultExportOptions(permalink);
        const content = renderExport(report, format, options);
        await navigator.clipboard.writeText(content);
        persistLastUsed(format, 'copy');
        const size = formatByteSize(byteSize(content));
        toast.success(`Copied ${size} as ${formatLabel(format)}`);
      } catch {
        toast.error('Failed to copy to clipboard');
      }
      setOpen(false);
    },
    [permalink, persistLastUsed, report]
  );

  const handleDownload = useCallback(
    (format: ExportFormat) => {
      try {
        const options = defaultExportOptions(permalink);
        const content = renderExport(report, format, options);
        const filename = exportFilename(report.id, format);
        downloadTextFile(content, filename, formatMimeType(format));
        persistLastUsed(format, 'download');
        toast.success(`Downloaded ${filename}`);
      } catch {
        toast.error('Failed to download file');
      }
      setOpen(false);
    },
    [permalink, persistLastUsed, report]
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
            <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 p-1">
          <TooltipProvider delayDuration={250}>
            {FORMAT_ROWS.map(({ format, icon: Icon }) => {
              const label = formatLabel(format);
              const extension = formatExtension(format);
              const isLastCopy = lastUsed?.format === format && lastUsed.action === 'copy';
              const isLastDownload = lastUsed?.format === format && lastUsed.action === 'download';
              return (
                <div
                  key={format}
                  className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors focus-within:bg-primary-tint hover:bg-primary-tint"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {label}
                  </span>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCopy(format)}
                          aria-label={`Copy ${label} to clipboard`}
                          className="relative text-muted-foreground hover:text-foreground"
                        >
                          <Copy />
                          {isLastCopy && (
                            <span
                              aria-hidden="true"
                              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
                            />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isLastCopy ? 'Copy to clipboard (last used)' : 'Copy to clipboard'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDownload(format)}
                          aria-label={`Download as .${extension}`}
                          className="relative text-muted-foreground hover:text-foreground"
                        >
                          <Download />
                          {isLastDownload && (
                            <span
                              aria-hidden="true"
                              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
                            />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isLastDownload
                          ? `Download .${extension} (last used)`
                          : `Download as .${extension}`}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </TooltipProvider>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setOpen(false);
              setCustomizeOpen(true);
            }}
          >
            Customize…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CustomizeExportDialog
        report={report}
        permalink={permalink}
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        onExported={persistLastUsed}
      />
    </>
  );
}
