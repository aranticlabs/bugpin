import { useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface TemplatePreviewProps {
  html: string;
  subject: string;
}

export function TemplatePreview({ html, subject }: TemplatePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const thumb = getComputedStyle(document.documentElement)
        .getPropertyValue('--muted-foreground')
        .trim();
      const style = doc.createElement('style');
      style.textContent = `
          * { scrollbar-width: thin; scrollbar-color: ${thumb} transparent; }
          *::-webkit-scrollbar { width: 10px; height: 10px; }
          *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent; }
          *::-webkit-scrollbar-thumb {
            background: ${thumb}; background-clip: padding-box;
            border: 3px solid transparent; border-radius: 9999px;
          }
        `;
      doc.head.appendChild(style);
      return () => style.remove();
    }
    return undefined;
  }, [html, resolvedTheme]);

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="border-b p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground">Subject</p>
        <p className="text-sm font-medium truncate">{subject}</p>
      </div>
      <iframe
        ref={iframeRef}
        title="Email Preview"
        className="w-full h-100 bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
