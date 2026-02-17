import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

interface VariablesReferenceProps {
  variables: string[];
  defaultOpen?: boolean;
}

const variableDescriptions: Record<string, string> = {
  'app.name': 'Application name (e.g., BugPin)',
  'app.url': 'Application URL',
  'project.name': 'Name of the project',
  'report.title': 'Title of the bug report',
  'report.description': 'Description of the bug report',
  'report.status': 'Current status (open, in_progress, resolved, closed)',
  'report.statusFormatted': 'Human-readable status (e.g., "In Progress")',
  'report.priority': 'Priority level (lowest, low, medium, high, highest)',
  'report.priorityFormatted': 'Human-readable priority (e.g., "High")',
  'report.url': 'URL to view the report in the admin',
  'report.pageUrl': 'URL of the page where the bug was reported',
  'report.createdAt': 'When the report was created',
  oldStatus: 'Previous status (for status change emails)',
  oldStatusFormatted: 'Human-readable previous status',
  newStatus: 'New status (for status change emails)',
  newStatusFormatted: 'Human-readable new status',
  'assignee.name': 'Name of the assigned user',
  'assignee.email': 'Email of the assigned user',
  'inviter.name': 'Name of the person sending the invitation',
  'invite.url': 'URL to accept the invitation',
  'invite.expiresInDays': 'Days until the invitation expires',
};

export function VariablesReference({ variables, defaultOpen = false }: VariablesReferenceProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const copyToClipboard = async (variable: string) => {
    try {
      await navigator.clipboard.writeText(`{{${variable}}}`);
      setCopiedVariable(variable);
      setTimeout(() => setCopiedVariable(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = `{{${variable}}}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedVariable(variable);
      setTimeout(() => setCopiedVariable(null), 2000);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between" size="sm">
          <span>Available Variables ({variables.length})</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
          {variables.map((variable) => (
            <div
              key={variable}
              className="flex items-start justify-between gap-2 p-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                  {`{{${variable}}}`}
                </code>
                {variableDescriptions[variable] && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {variableDescriptions[variable]}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => copyToClipboard(variable)}
              >
                {copiedVariable === variable ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
