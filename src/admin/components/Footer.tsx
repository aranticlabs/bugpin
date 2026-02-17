import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { AboutDialog } from './AboutDialog';

const GITHUB_URL = 'https://github.com/aranticlabs/bugpin';

export function Footer() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <footer className="border-t py-2 px-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-1">
          <span>© {currentYear} Arantic Digital</span>
          <span>|</span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setAboutOpen(true);
            }}
            className="text-primary hover:underline"
          >
            About
          </a>
          <span>|</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <span>GitHub</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </footer>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
