import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { ExternalLink } from 'lucide-react';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

const VERSION = '1.0.0';
const GITHUB_URL = 'https://github.com/aranticlabs/bugpin';
const LICENSE_URL = 'https://docs.bugpin.io/legal/license';
const TRADEMARK_URL = 'https://docs.bugpin.io/legal/trademark';

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const currentYear = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About BugPin</DialogTitle>
          <DialogDescription>Self-hosted bug reporting and feedback widget</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Version</p>
            <p className="text-sm text-muted-foreground">{VERSION}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Copyright</p>
            <p className="text-sm text-muted-foreground">© {currentYear} Arantic Digital</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">License</p>
            <p className="text-sm text-muted-foreground">
              AGPL-3.0 (Server/Admin Portal), MIT (Widget)
            </p>
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
            >
              View License
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Source Code</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {GITHUB_URL.replace('https://', '')}
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-xs text-muted-foreground mt-1">
              BugPin is open source software. Contributions are welcome!
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Trademark</p>
            <p className="text-sm text-muted-foreground">
              BugPin is a trademark of Arantic Digital
            </p>
            <a
              href={TRADEMARK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
            >
              View Trademark Policy
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              This software includes third-party open source components. See the{' '}
              <a
                href={`${GITHUB_URL}/blob/main/NOTICE`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                NOTICE
              </a>{' '}
              file for details.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
