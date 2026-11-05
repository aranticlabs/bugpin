import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Download, ExternalLink, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Spinner } from '../ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { generateApiKeyPdf } from '../../lib/generate-api-key-pdf';
import { useBranding } from '../../contexts/BrandingContext';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
});

type CreateProjectFormData = z.infer<typeof createProjectSchema>;

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isLoading: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '' },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({ name: '' });
    }
  }, [open, reset]);

  const onSubmit = (data: CreateProjectFormData) => {
    onCreate(data.name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project to get an API key for the widget.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                placeholder="My Website"
                autoFocus
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeyDialog({
  apiKey,
  projectName,
  open,
  onOpenChange,
}: {
  apiKey: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { config: branding } = useBranding();

  const widgetSnippet = `<!-- Start of BugPin Widget -->
<script src="${window.location.origin}/widget.js" data-api-key="${apiKey}"></script>
<!-- End of BugPin Widget -->`;

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await generateApiKeyPdf({
        projectName,
        apiKey,
        serverUrl: window.location.origin,
        branding: branding
          ? {
              primaryColor: branding.primaryColor,
              logoLightUrl: branding.logoLightUrl,
              logoDarkUrl: branding.logoDarkUrl,
              iconLightUrl: branding.iconLightUrl,
              iconDarkUrl: branding.iconDarkUrl,
            }
          : undefined,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const copyWidgetSnippet = () => {
    navigator.clipboard.writeText(widgetSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>API Key for "{projectName}"</DialogTitle>
          <DialogDescription>Install the widget with this API key and snippet.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <code className="block px-3 py-2 bg-muted rounded-lg text-sm font-mono break-all">
              {apiKey}
            </code>
            <Button variant="outline" size="sm" className="w-full" onClick={copyApiKey}>
              {copiedKey ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy API Key
                </>
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Widget Snippet</Label>
            <pre className="px-3 py-2 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap break-all">
              {widgetSnippet}
            </pre>
            <Button variant="outline" size="sm" className="w-full" onClick={copyWidgetSnippet}>
              {copiedSnippet ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Widget Snippet
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Add this snippet to your website's HTML to enable bug reporting.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Settings className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Advanced Integration</p>
                <p className="text-sm text-muted-foreground">
                  Need more control? Use the Widget API for custom triggers, callbacks, and
                  programmatic control.
                </p>
                <a
                  href="https://docs.bugpin.io/widget/installation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-1"
                >
                  View documentation
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="w-full sm:w-auto"
          >
            {isGeneratingPdf ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
