import { useEffect, useRef } from 'react';

interface TemplatePreviewProps {
  html: string;
  subject: string;
}

export function TemplatePreview({ html, subject }: TemplatePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="border-b p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground">Subject</p>
        <p className="text-sm font-medium truncate">{subject}</p>
      </div>
      <iframe
        ref={iframeRef}
        title="Email Preview"
        className="w-full h-[400px] bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
